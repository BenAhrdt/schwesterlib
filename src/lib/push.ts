import webpush from "web-push";
import { z } from "zod";
import { db } from "./db";
import { AppError, decrypt, encrypt } from "./security";
import type { Actor } from "./auth";
import type { PushSubscription } from "@/generated/prisma/client";

// Only browser-operated push services may receive server-side requests.
// Do not accept arbitrary URLs (including private-network targets).
export function validPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname === "updates-autopush.push.services.mozilla.com" ||
        url.hostname === "web.push.apple.com" ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
const endpointSchema = z
  .string()
  .max(4096)
  .refine(validPushEndpoint, "Dieser Push-Dienst wird nicht unterstützt.");
export const pushSubscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]{87}={0,1}$/)
      .refine((value) => {
        const bytes = Buffer.from(value, "base64url");
        return bytes.length === 65 && bytes[0] === 4;
      }),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
  }),
  reminders: z.boolean().default(true),
});
const deviceSchema = z.object({ endpoint: endpointSchema });

export async function pushConfiguration() {
  const existing = await db.pushConfiguration.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  const keys = webpush.generateVAPIDKeys();
  return db.pushConfiguration.upsert({
    where: { id: 1 },
    update: {},
    create: {
      publicKey: keys.publicKey,
      privateKeyEncrypted: encrypt(keys.privateKey),
    },
  });
}
export async function savePushSubscription(actor: Actor, input: unknown) {
  const { endpoint, keys, reminders } = pushSubscriptionSchema.parse(input);
  await pushConfiguration();
  // An endpoint belongs to one browser profile. Explicit opt-in transfers it
  // when a different account uses that browser; never send to both accounts.
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, ...keys, userId: actor.id, reminders },
    update: { ...keys, userId: actor.id, reminders },
  });
}
export async function removePushSubscription(actor: Actor, input: unknown) {
  const { endpoint } = deviceSchema.parse(input);
  await db.pushSubscription.deleteMany({
    where: { endpoint, userId: actor.id },
  });
}
export async function pushDevice(actor: Actor, input: unknown) {
  const { endpoint } = deviceSchema.parse(input);
  const device = await db.pushSubscription.findFirst({
    where: { endpoint, userId: actor.id },
  });
  return { active: !!device, reminders: device?.reminders ?? true };
}
export async function setPushReminders(actor: Actor, input: unknown) {
  const { endpoint, reminders } = deviceSchema
    .extend({ reminders: z.boolean() })
    .parse(input);
  const result = await db.pushSubscription.updateMany({
    where: { endpoint, userId: actor.id },
    data: { reminders },
  });
  if (!result.count)
    throw new AppError("Bitte Push-Benachrichtigungen zuerst aktivieren.");
}
export async function deliverPush(
  subscriptions: PushSubscription[],
  body: string,
  tag: string,
  ttl = 3600,
) {
  if (!subscriptions.length) return;
  const config = await pushConfiguration();
  const vapidDetails = {
    subject: process.env.VAPID_SUBJECT || process.env.APP_URL!,
    publicKey: config.publicKey,
    privateKey: decrypt(config.privateKeyEncrypted),
  };
  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      if (!validPushEndpoint(sub.endpoint))
        throw new AppError("Ungültiger Push-Dienst.");
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title: "SchwesterLib",
            body,
            tag,
            url: "/dashboard",
          }),
          { vapidDetails, timeout: 5000, TTL: ttl },
        );
      } catch (error) {
        if (
          [404, 410].includes(
            (error as { statusCode?: number }).statusCode ?? 0,
          )
        ) {
          await db.pushSubscription.deleteMany({
            where: { id: sub.id, userId: sub.userId, auth: sub.auth },
          });
          return;
        }
        throw new AppError("Push konnte nicht zugestellt werden.");
      }
    }),
  );
  if (results.some((result) => result.status === "rejected"))
    throw new AppError(
      "Mindestens eine Push-Nachricht konnte nicht zugestellt werden.",
    );
}
export async function appointmentPush(
  id: string,
  event: "gebucht" | "verschoben" | "abgesagt" | "aktualisiert",
) {
  const a = await db.appointment.findUnique({
    where: { id },
    include: { provider: { include: { user: true } } },
  });
  if (!a) return;
  const recipients = new Set([a.userId]);
  if (
    event !== "aktualisiert" &&
    a.provider.user?.active &&
    a.provider.user.role === "PROVIDER"
  )
    recipients.add(a.provider.user.id);
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: [...recipients] }, user: { active: true } },
  });
  await deliverPush(
    subscriptions,
    `Ein Termin wurde ${event}. Die Details findest du in der Anwendung.`,
    `appointment-${id}`,
  );
}
export async function testPush(actor: Actor, input: unknown) {
  const { endpoint } = deviceSchema.parse(input);
  const subscriptions = await db.pushSubscription.findMany({
    where: { endpoint, userId: actor.id, user: { active: true } },
  });
  if (!subscriptions.length)
    throw new AppError("Bitte Push-Benachrichtigungen zuerst aktivieren.");
  await deliverPush(
    subscriptions,
    "Push-Benachrichtigungen sind auf diesem Gerät eingerichtet.",
    "push-test",
  );
}
