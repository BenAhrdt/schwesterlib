import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { db } from "./db";
import { AppError, digest, token } from "./security";
import type { Role } from "@/generated/prisma/client";
export const publicUser = {
  id: true,
  username: true,
  displayName: true,
  email: true,
  role: true,
  active: true,
  provider: { select: { id: true } },
} as const;
export type Actor = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
async function cookieSession() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new AppError("SESSION_SECRET muss mindestens 32 Zeichen haben.", 503);
  return getIronSession<{ token?: string }>(await cookies(), {
    password: secret,
    cookieName:
      process.env.NODE_ENV === "production"
        ? "__Host-schwesterlib"
        : "schwesterlib",
    ttl: 60 * 60 * 24 * 7,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  });
}
export async function currentUser() {
  const session = await cookieSession();
  if (!session.token) return null;
  const record = await db.session.findUnique({
    where: { id: digest(session.token) },
    include: { user: { select: publicUser } },
  });
  return record && record.expiresAt > new Date() && record.user.active
    ? record.user
    : null;
}
export async function requireUser(roles?: Role[]) {
  const user = await currentUser();
  if (!user) throw new AppError("Bitte melden Sie sich an.", 401);
  if (roles && !roles.includes(user.role))
    throw new AppError("Keine Berechtigung.", 403);
  return user;
}
export function requireRole(actor: { role: Role }, roles: Role[]) {
  if (!roles.includes(actor.role))
    throw new AppError("Keine Berechtigung.", 403);
}
export async function startSession(userId: string) {
  const session = await cookieSession();
  if (session.token)
    await db.session.deleteMany({ where: { id: digest(session.token) } });
  const value = token();
  await db.session.create({
    data: {
      id: digest(value),
      userId,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  session.token = value;
  await session.save();
}
export async function endSession() {
  const session = await cookieSession();
  if (session.token)
    await db.session.deleteMany({ where: { id: digest(session.token) } });
  session.destroy();
}
