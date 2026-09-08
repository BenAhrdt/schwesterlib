import { z } from "zod";
import { db } from "./db";
import {
  AppError,
  digest,
  hashPassword,
  token,
  verifyPassword,
} from "./security";
import { credentialsSchema, inviteSchema } from "./validation";
import { requireRole, type Actor, publicUser } from "./auth";
import type { Prisma } from "@/generated/prisma/client";
export const audit = (
  tx: Prisma.TransactionClient,
  action: string,
  actorId?: string,
  targetId?: string,
) => tx.auditLog.create({ data: { action, actorId, targetId } });
export async function setupOpen() {
  const [settings, count] = await Promise.all([
    db.appSettings.findUnique({ where: { id: 1 } }),
    db.user.count({ where: { role: "ADMIN" } }),
  ]);
  return !settings?.setupCompleted && count === 0;
}
export async function createInitialAdmin(input: unknown) {
  const data = credentialsSchema.parse(input);
  if (
    (process.env.NODE_ENV === "production" || process.env.SETUP_KEY) &&
    (!process.env.SETUP_KEY ||
      digest(data.setupKey ?? "") !== digest(process.env.SETUP_KEY))
  )
    throw new AppError("Ungültiger Setup-Schlüssel.", 403);
  const passwordHash = await hashPassword(data.password);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(10001)`;
    const settings = await tx.appSettings.findUnique({ where: { id: 1 } });
    if (
      settings?.setupCompleted ||
      (await tx.user.count({ where: { role: "ADMIN" } }))
    )
      throw new AppError("Das Setup ist bereits abgeschlossen.", 403);
    const user = await tx.user.create({
      data: {
        username: data.username,
        displayName: data.displayName,
        email: data.email,
        passwordHash,
        role: "ADMIN",
      },
      select: publicUser,
    });
    await tx.appSettings.upsert({
      where: { id: 1 },
      create: { id: 1, setupCompleted: true },
      update: { setupCompleted: true },
    });
    await audit(tx, "USER_CREATED", user.id, user.id);
    return user;
  });
}
let dummyHash: Promise<string> | undefined;
export async function authenticate(input: unknown) {
  const data = z
    .object({ username: z.string().max(128), password: z.string().max(128) })
    .parse(input);
  const user = await db.user.findUnique({
    where: { username: data.username.trim().toLowerCase() },
  });
  dummyHash ??= hashPassword(token());
  const valid = await verifyPassword(
    user?.passwordHash ?? (await dummyHash),
    data.password,
  );
  if (!user || !valid || !user.active) {
    await audit(db, "LOGIN_FAILED");
    throw new AppError("Benutzername oder Passwort ist falsch.", 401);
  }
  await audit(db, "LOGIN", user.id);
  return user.id;
}
export async function createInvitation(actor: Actor, input: unknown) {
  requireRole(actor, ["ADMIN"]);
  const data = inviteSchema.parse(input);
  const secret = token();
  const invitation = await db.$transaction(async (tx) => {
    const result = await tx.invitation.create({
      data: {
        ...data,
        expiresAt: new Date(data.expiresAt),
        tokenHash: digest(secret),
        createdBy: actor.id,
      },
    });
    await audit(tx, "INVITATION_CREATED", actor.id, result.id);
    return result;
  });
  return { invitation, link: `${process.env.APP_URL}/invite/${secret}` };
}
export async function inspectInvitation(secret: string) {
  const invite = await db.invitation.findUnique({
    where: { tokenHash: digest(secret) },
  });
  if (!invite || invite.status !== "OPEN" || invite.expiresAt <= new Date())
    throw new AppError("Diese Einladung ist ungültig oder abgelaufen.", 404);
  return {
    email: invite.email,
    displayName: invite.displayName,
    role: invite.role,
  };
}
export async function acceptInvitation(secret: string, input: unknown) {
  const data = credentialsSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${digest(secret)}, 1))`;
    const invite = await tx.invitation.findUnique({
      where: { tokenHash: digest(secret) },
    });
    if (!invite || invite.status !== "OPEN" || invite.expiresAt <= new Date())
      throw new AppError("Diese Einladung ist ungültig oder abgelaufen.", 404);
    if (invite.email && data.email !== invite.email)
      throw new AppError("Die E-Mail-Adresse muss der Einladung entsprechen.");
    const claimed = await tx.invitation.updateMany({
      where: { id: invite.id, status: "OPEN", expiresAt: { gt: new Date() } },
      data: { status: "USED" },
    });
    if (claimed.count !== 1)
      throw new AppError("Diese Einladung ist nicht mehr gültig.");
    const user = await tx.user.create({
      data: {
        username: data.username,
        displayName: data.displayName,
        email: invite.email ?? data.email,
        passwordHash,
        role: invite.role,
        ...(invite.role === "PROVIDER" ? { provider: { create: {} } } : {}),
      },
      select: publicUser,
    });
    await audit(tx, "USER_CREATED", user.id, user.id);
    return user;
  });
}
export async function revokeInvitation(actor: Actor, id: string) {
  requireRole(actor, ["ADMIN"]);
  await db.$transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: { id, status: "OPEN" },
      data: { status: "REVOKED" },
    });
    await audit(tx, "INVITATION_REVOKED", actor.id, id);
  });
}
export async function createUser(actor: Actor, input: unknown) {
  requireRole(actor, ["ADMIN"]);
  const data = credentialsSchema.parse(input);
  const { role } = z
    .object({ role: z.enum(["ADMIN", "PROVIDER", "USER"]) })
    .parse(input);
  const passwordHash = await hashPassword(data.password);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: data.username,
        displayName: data.displayName,
        email: data.email,
        passwordHash,
        role,
        ...(role === "PROVIDER" ? { provider: { create: {} } } : {}),
      },
      select: publicUser,
    });
    await audit(tx, "USER_CREATED", actor.id, user.id);
    return user;
  });
}
export async function updateUser(actor: Actor, input: unknown) {
  requireRole(actor, ["ADMIN"]);
  const data = z
    .object({
      id: z.string(),
      role: z.enum(["ADMIN", "PROVIDER", "USER"]),
      active: z.boolean(),
    })
    .parse(input);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(10001)`;
    const previous = await tx.user.findUniqueOrThrow({
      where: { id: data.id },
    });
    if (
      previous.role === "ADMIN" &&
      previous.active &&
      (data.role !== "ADMIN" || !data.active) &&
      (await tx.user.count({ where: { role: "ADMIN", active: true } })) <= 1
    )
      throw new AppError(
        "Der letzte aktive Administrator muss erhalten bleiben.",
      );
    await tx.user.update({
      where: { id: data.id },
      data: { role: data.role, active: data.active },
    });
    if (data.role === "PROVIDER")
      await tx.providerProfile.upsert({
        where: { userId: data.id },
        create: { userId: data.id },
        update: {},
      });
    await tx.session.deleteMany({ where: { userId: data.id } });
    await audit(tx, "USER_ROLE_CHANGED", actor.id, data.id);
  });
}
