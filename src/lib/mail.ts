import nodemailer from "nodemailer";
import { db } from "./db";
import { AppError, decrypt, encrypt } from "./security";
import { requireRole, type Actor } from "./auth";
import { smtpSchema } from "./validation";
import { audit } from "./accounts";
async function transport() {
  const config = await db.emailConfiguration.findUnique({ where: { id: 1 } });
  if (!config) throw new AppError("SMTP ist noch nicht eingerichtet.");
  return {
    config,
    mailer: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure,
      auth: config.username
        ? { user: config.username, pass: decrypt(config.passwordEncrypted) }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: { rejectUnauthorized: true },
    }),
  };
}
export async function saveSmtp(actor: Actor, input: unknown) {
  requireRole(actor, ["ADMIN"]);
  const { password, ...data } = smtpSchema.parse(input);
  const old = await db.emailConfiguration.findUnique({ where: { id: 1 } });
  if (!old && !password && data.username)
    throw new AppError("Bitte SMTP-Passwort angeben.");
  const passwordEncrypted = password
    ? encrypt(password)
    : (old?.passwordEncrypted ?? encrypt(""));
  await db.$transaction(async (tx) => {
    await tx.emailConfiguration.upsert({
      where: { id: 1 },
      create: { ...data, passwordEncrypted },
      update: { ...data, passwordEncrypted },
    });
    await audit(tx, "SMTP_CHANGED", actor.id);
  });
}
export async function smtpAction(actor: Actor, recipient?: string) {
  requireRole(actor, ["ADMIN"]);
  const { config, mailer } = await transport();
  if (recipient)
    await mailer.sendMail({
      from: { name: config.senderName, address: config.senderAddress },
      to: recipient,
      subject: "SchwesterLib · Testmail",
      text: "Die E-Mail-Verbindung funktioniert. Zeit für einen Kaffee.",
    });
  else await mailer.verify();
}
export async function sendMail(to: string, subject: string, text: string) {
  const { config, mailer } = await transport();
  await mailer.sendMail({
    from: { name: config.senderName, address: config.senderAddress },
    to,
    subject,
    text,
  });
}
export async function appointmentMail(
  id: string,
  event: "gebucht" | "verschoben" | "aktualisiert",
) {
  const a = await db.appointment.findUnique({
    where: { id },
    include: { user: true, provider: { include: { user: true } } },
  });
  if (!a?.user.email || !(await db.emailConfiguration.count())) return;
  // Keep organizational details in the authenticated app, not in email.
  await sendMail(
    a.user.email,
    `SchwesterLib · Termin ${event}`,
    `Ihr Termin wurde ${event}. Die aktuellen Details finden Sie unter ${process.env.APP_URL}/appointments.`,
  );
}
