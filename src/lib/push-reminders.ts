import { db } from "./db";
import { deliverPush } from "./push";

export async function sendDuePushReminders(now = new Date()) {
  const due = {
    status: { in: ["PENDING", "CONFIRMED"] as ("PENDING" | "CONFIRMED")[] },
    pushReminderAt: null,
    startsAt: {
      gt: new Date(now.getTime() + 5 * 60000),
      lte: new Date(now.getTime() + 24 * 3600000),
    },
    // Avoid following a last-minute booking immediately with a reminder.
    createdAt: { lte: new Date(now.getTime() - 5 * 60000) },
    user: { active: true, pushSubscriptions: { some: { reminders: true } } },
  };
  const appointments = await db.appointment.findMany({
    where: due,
    select: { id: true, providerId: true },
    orderBy: { startsAt: "asc" },
    take: 25,
  });
  for (const candidate of appointments) {
    try {
      await db.$transaction(
        async (tx) => {
          // Share scheduling's lock: no reminder for a concurrent cancellation
          // or reschedule, and no duplicate delivery from multiple server instances.
          const [lock] = await tx.$queryRaw<
            { locked: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(hashtextextended(${candidate.providerId}, 2)) AS locked`;
          if (!lock.locked) return;
          const appointment = await tx.appointment.findFirst({
            where: { ...due, id: candidate.id },
          });
          if (!appointment) return;
          const subscriptions = await tx.pushSubscription.findMany({
            where: {
              userId: appointment.userId,
              reminders: true,
              user: { active: true },
            },
          });
          if (!subscriptions.length) return;
          await deliverPush(
            subscriptions,
            "Du hast einen bevorstehenden Termin. Die Details findest du in der Anwendung.",
            `reminder-${appointment.id}`,
            Math.max(
              1,
              Math.floor(
                (appointment.startsAt.getTime() - now.getTime()) / 1000,
              ),
            ),
          );
          await tx.appointment.update({
            where: { id: appointment.id },
            data: { pushReminderAt: now },
          });
        },
        { timeout: 15000 },
      );
    } catch {
      // Retry on the next tick. Never log endpoints, keys or appointment details.
      console.warn(
        "Eine Push-Erinnerung konnte nicht zugestellt werden; erneuter Versuch folgt.",
      );
    }
  }
}

export function startPushReminders() {
  const globalWorker = globalThis as typeof globalThis & {
    pushReminderTimer?: ReturnType<typeof setInterval>;
  };
  if (globalWorker.pushReminderTimer) return;
  let running = false;
  globalWorker.pushReminderTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await sendDuePushReminders();
    } catch {
      console.warn("Push-Erinnerungen derzeit nicht verfügbar.");
    } finally {
      running = false;
    }
  }, 60000);
  globalWorker.pushReminderTimer.unref();
}
