import { z } from "zod";
export const roleSchema = z.enum(["USER", "PROVIDER", "ADMIN"]);
export const emailSchema = z
  .union([z.email().max(254), z.literal("")])
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null));
export const credentialsSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9_.-]{3,32}$/,
        "Benutzername: 3–32 Buchstaben, Zahlen, Punkt, Strich oder Unterstrich.",
      ),
    displayName: z.string().trim().min(2).max(80),
    email: emailSchema,
    password: z
      .string()
      .min(12, "Das Passwort benötigt mindestens 12 Zeichen.")
      .max(128),
    passwordConfirm: z.string(),
    setupKey: z.string().optional(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Die Passwörter stimmen nicht überein.",
    path: ["passwordConfirm"],
  });
export const inviteSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().max(80).optional(),
  role: roleSchema,
  expiresAt: z.iso
    .datetime()
    .refine(
      (v) =>
        new Date(v) > new Date() &&
        new Date(v).getTime() < Date.now() + 90 * 86400000,
      "Ablaufdatum muss innerhalb der nächsten 90 Tage liegen.",
    ),
});
export const typeSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().max(500).default(""),
  duration: z.number().int().min(5).max(240),
  bufferBefore: z.number().int().min(0).max(120),
  bufferAfter: z.number().int().min(0).max(120),
  active: z.boolean(),
  color: z.enum(["teal", "blue", "violet", "orange"]).default("teal"),
  providerIds: z.array(z.string()).max(100),
});
export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: emailSchema,
});
export const providerSchema = z.object({
  id: z.string(),
  draftDisplayName: z.string().trim().min(2).max(80).optional(),
  emailNotifications: z.boolean().optional(),
  specialty: z.string().max(160),
  description: z.string().max(1000),
  location: z.string().max(160),
  qualifications: z.string().max(300),
  imageUrl: z.union([
    z.literal(""),
    z
      .string()
      .url()
      .regex(/^https:\/\//),
  ]),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("de", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
  active: z.boolean(),
});
export const rulesSchema = z.object({
  providerId: z.string(),
  rules: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          startMinute: z.number().int().min(0).max(1439),
          endMinute: z.number().int().min(1).max(1440),
        })
        .refine((v) => v.endMinute > v.startMinute),
    )
    .max(28),
});
export const exceptionSchema = z
  .object({
    providerId: z.string(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    available: z.boolean(),
  })
  .refine(
    (v) => new Date(v.endsAt) > new Date(v.startsAt),
    "Ende muss nach Beginn liegen.",
  );
export const bookingSchema = z.object({
  providerId: z.string(),
  typeId: z.string(),
  startsAt: z.iso.datetime(),
  appointmentId: z.string().optional(),
});
export const smtpSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().max(254),
  password: z.string().max(500).optional(),
  senderName: z.string().trim().min(1).max(100),
  senderAddress: z.email(),
});
