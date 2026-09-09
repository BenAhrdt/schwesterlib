import { addDays, addMinutes, format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { db } from "./db";
import type { Prisma, Appointment } from "@/generated/prisma/client";
import { AppError } from "./security";
import { type Actor, requireRole } from "./auth";
import { audit } from "./accounts";
import {
  bookingSchema,
  exceptionSchema,
  rulesSchema,
  providerSchema,
} from "./validation";
export const activeStatuses = ["PENDING", "CONFIRMED"] as const;
export const overlap = (a: Date, b: Date, c: Date, d: Date) => a < d && b > c;
export async function providerAccess(
  tx: Prisma.TransactionClient,
  actor: Actor,
  id: string,
) {
  requireRole(actor, ["ADMIN", "PROVIDER"]);
  const provider = await tx.providerProfile.findUnique({ where: { id } });
  if (!provider || (actor.role !== "ADMIN" && provider.userId !== actor.id))
    throw new AppError("Keine Berechtigung.", 403);
  return provider;
}
export const lockProvider = (tx: Prisma.TransactionClient, id: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 2))`;
export async function saveProvider(actor: Actor, input: unknown) {
  const { id, draftDisplayName, ...values } = providerSchema.parse(input);
  await db.$transaction(async (tx) => {
    await lockProvider(tx, id);
    const provider = await providerAccess(tx, actor, id);
    if (draftDisplayName !== undefined) {
      if (!provider.invitationId)
        throw new AppError(
          "Das Konto ist bereits angelegt. Bitte das Benutzerprofil bearbeiten.",
        );
      await tx.invitation.update({
        where: { id: provider.invitationId },
        data: { displayName: draftDisplayName },
      });
    }
    await tx.providerProfile.update({ where: { id }, data: values });
    await audit(tx, "PROVIDER_CHANGED", actor.id, id);
  });
}
export async function availableSlots(
  providerId: string,
  typeId: string,
  date: string,
  tx: Prisma.TransactionClient = db,
  excludeId?: string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new AppError("Ungültiges Datum.");
  const provider = await tx.providerProfile.findUnique({
    where: { id: providerId },
    include: {
      user: { select: { active: true, role: true } },
      rules: true,
      types: { where: { id: typeId, active: true } },
    },
  });
  if (
    !provider?.active ||
    !provider.user?.active ||
    provider.user.role !== "PROVIDER" ||
    !provider.types[0]
  )
    return [];
  const type = provider.types[0];
  const tz = provider.timezone;
  const dayStart = fromZonedTime(`${date}T00:00:00`, tz);
  const nextDate = format(
    addDays(new Date(`${date}T12:00:00Z`), 1),
    "yyyy-MM-dd",
  );
  const dayEnd = fromZonedTime(`${nextDate}T00:00:00`, tz);
  const horizon =
    (await tx.appSettings.findUnique({ where: { id: 1 } }))
      ?.bookingHorizonDays ?? 90;
  if (dayStart > addDays(new Date(), horizon) || dayEnd <= new Date())
    return [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const minuteDate = (m: number) =>
    m === 1440
      ? dayEnd
      : fromZonedTime(
          `${date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`,
          tz,
        );
  const windows = provider.rules
    .filter((r) => r.weekday === weekday)
    .map((r) => ({
      startsAt: minuteDate(r.startMinute),
      endsAt: minuteDate(r.endMinute),
    }));
  const exceptions = await tx.availabilityException.findMany({
    where: {
      providerId,
      startsAt: { lt: addMinutes(dayEnd, type.duration + type.bufferAfter) },
      endsAt: { gt: addMinutes(dayStart, -type.bufferBefore) },
    },
  });
  const appointments = await tx.appointment.findMany({
    where: {
      providerId,
      status: { in: [...activeStatuses] },
      occupiedStart: {
        lt: addMinutes(dayEnd, type.duration + type.bufferAfter),
      },
      occupiedEnd: { gt: addMinutes(dayStart, -type.bufferBefore) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  windows.push(...exceptions.filter((e) => e.available));
  const slots: { startsAt: string; endsAt: string; label: string }[] = [];
  for (let start = dayStart; start < dayEnd; start = addMinutes(start, 5)) {
    if (start <= new Date()) continue;
    const end = addMinutes(start, type.duration),
      occupiedStart = addMinutes(start, -type.bufferBefore),
      occupiedEnd = addMinutes(end, type.bufferAfter);
    if (
      !windows.some(
        (w) => occupiedStart >= w.startsAt && occupiedEnd <= w.endsAt,
      )
    )
      continue;
    if (
      exceptions.some(
        (e) =>
          !e.available &&
          overlap(occupiedStart, occupiedEnd, e.startsAt, e.endsAt),
      )
    )
      continue;
    if (
      appointments.some((a) =>
        overlap(occupiedStart, occupiedEnd, a.occupiedStart, a.occupiedEnd),
      )
    )
      continue;
    slots.push({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      label: formatInTimeZone(start, tz, "HH:mm xxx"),
    });
  }
  return slots;
}
export async function bookAppointment(actor: Actor, input: unknown) {
  const data = bookingSchema.parse(input);
  return db.$transaction(async (tx) => {
    await lockProvider(tx, data.providerId);
    let existing: Appointment | null = null;
    if (data.appointmentId) {
      existing = await tx.appointment.findUnique({
        where: { id: data.appointmentId },
      });
      if (!existing || (existing.userId !== actor.id && actor.role !== "ADMIN"))
        throw new AppError("Keine Berechtigung.", 403);
      if (
        existing.providerId !== data.providerId ||
        existing.typeId !== data.typeId
      )
        throw new AppError(
          "Beim Verschieben müssen Behandler und Terminart gleich bleiben.",
        );
      if (
        !activeStatuses.some((s) => s === existing!.status) ||
        existing.startsAt <= new Date()
      )
        throw new AppError("Dieser Termin kann nicht mehr verschoben werden.");
    }
    const provider = await tx.providerProfile.findUniqueOrThrow({
      where: { id: data.providerId },
    });
    const date = formatInTimeZone(
      new Date(data.startsAt),
      provider.timezone,
      "yyyy-MM-dd",
    );
    const slots = await availableSlots(
      data.providerId,
      data.typeId,
      date,
      tx,
      data.appointmentId,
    );
    if (
      !slots.some((s) => s.startsAt === new Date(data.startsAt).toISOString())
    )
      throw new AppError(
        "Dieser Termin ist nicht mehr verfügbar. Bitte wählen Sie eine andere Uhrzeit.",
        409,
      );
    const type = await tx.appointmentType.findUniqueOrThrow({
      where: { id: data.typeId },
    });
    const startsAt = new Date(data.startsAt),
      endsAt = addMinutes(startsAt, type.duration);
    const values = {
      startsAt,
      endsAt,
      occupiedStart: addMinutes(startsAt, -type.bufferBefore),
      occupiedEnd: addMinutes(endsAt, type.bufferAfter),
      pushReminderAt: null,
    };
    const appointment = existing
      ? await tx.appointment.update({
          where: { id: existing.id },
          data: values,
        })
      : await tx.appointment.create({
          data: {
            ...values,
            userId: actor.id,
            providerId: data.providerId,
            typeId: data.typeId,
            typeName: type.name,
          },
        });
    await audit(
      tx,
      existing ? "APPOINTMENT_RESCHEDULED" : "APPOINTMENT_CREATED",
      actor.id,
      appointment.id,
    );
    return appointment;
  });
}
export async function changeAppointmentStatus(actor: Actor, input: unknown) {
  const data = z
    .object({
      id: z.string(),
      status: z.enum([
        "PENDING",
        "CONFIRMED",
        "CANCELLED",
        "COMPLETED",
        "NO_SHOW",
      ]),
    })
    .parse(input);
  const initial = await db.appointment.findUnique({ where: { id: data.id } });
  if (!initial) throw new AppError("Termin nicht gefunden.", 404);
  return db.$transaction(async (tx) => {
    await lockProvider(tx, initial.providerId);
    const appt = await tx.appointment.findUniqueOrThrow({
      where: { id: data.id },
      include: { provider: true },
    });
    const manages =
      actor.role === "ADMIN" ||
      (actor.role === "PROVIDER" && appt.provider.userId === actor.id);
    if (!manages && (appt.userId !== actor.id || data.status !== "CANCELLED"))
      throw new AppError("Keine Berechtigung.", 403);
    if (!activeStatuses.some((s) => s === appt.status))
      throw new AppError("Der Termin ist bereits abgeschlossen oder abgesagt.");
    if (!manages && appt.startsAt <= new Date())
      throw new AppError("Vergangene Termine können nicht abgesagt werden.");
    if (
      ["COMPLETED", "NO_SHOW"].includes(data.status) &&
      appt.startsAt > new Date()
    )
      throw new AppError("Diese Aktion ist erst nach Terminbeginn möglich.");
    if (data.status === "PENDING")
      throw new AppError("Dieser Statuswechsel ist nicht erlaubt.");
    const result = await tx.appointment.update({
      where: { id: data.id },
      data: { status: data.status },
    });
    await audit(
      tx,
      data.status === "CANCELLED"
        ? "APPOINTMENT_CANCELLED"
        : "APPOINTMENT_STATUS_CHANGED",
      actor.id,
      appt.id,
    );
    return result;
  });
}
export async function saveRules(actor: Actor, input: unknown) {
  const data = rulesSchema.parse(input);
  await db.$transaction(async (tx) => {
    await providerAccess(tx, actor, data.providerId);
    await lockProvider(tx, data.providerId);
    await tx.availabilityRule.deleteMany({
      where: { providerId: data.providerId },
    });
    await tx.availabilityRule.createMany({
      data: data.rules.map((r) => ({ ...r, providerId: data.providerId })),
    });
    await audit(tx, "AVAILABILITY_CHANGED", actor.id, data.providerId);
  });
}
export async function addException(actor: Actor, input: unknown) {
  const data = exceptionSchema.parse(input);
  return db.$transaction(async (tx) => {
    await providerAccess(tx, actor, data.providerId);
    await lockProvider(tx, data.providerId);
    const startsAt = new Date(data.startsAt),
      endsAt = new Date(data.endsAt);
    if (
      !data.available &&
      (await tx.appointment.count({
        where: {
          providerId: data.providerId,
          status: { in: [...activeStatuses] },
          occupiedStart: { lt: endsAt },
          occupiedEnd: { gt: startsAt },
        },
      }))
    )
      throw new AppError(
        "In diesem Zeitraum liegen Termine. Bitte zuerst absagen oder verschieben.",
        409,
      );
    const result = await tx.availabilityException.create({
      data: { ...data, startsAt, endsAt },
    });
    await audit(tx, "AVAILABILITY_EXCEPTION_CREATED", actor.id, result.id);
    return result;
  });
}
export async function removeException(actor: Actor, id: string) {
  await db.$transaction(async (tx) => {
    const item = await tx.availabilityException.findUniqueOrThrow({
      where: { id },
    });
    await providerAccess(tx, actor, item.providerId);
    await lockProvider(tx, item.providerId);
    await tx.availabilityException.delete({ where: { id } });
    await audit(tx, "AVAILABILITY_EXCEPTION_REMOVED", actor.id, id);
  });
}
