import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { addDays, format } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { db } from "../src/lib/db";
import {
  createInitialAdmin,
  setupOpen,
  authenticate,
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  createUser,
  updateUser,
} from "../src/lib/accounts";
import {
  bookAppointment,
  availableSlots,
  changeAppointmentStatus,
  saveRules,
  addException,
} from "../src/lib/scheduling";
import { type Actor, requireRole } from "../src/lib/auth";
import { digest, rateLimit } from "../src/lib/security";
const enabled = !!process.env.DATABASE_URL;
const password = "A long unique test password 2026!";
const credentials = (username: string) => ({
  username,
  displayName: username,
  password,
  passwordConfirm: password,
  email: "",
});
let admin: Actor,
  provider: Actor,
  user: Actor,
  other: Actor,
  providerId: string,
  typeId: string,
  date: string,
  startsAt: string;
beforeAll(() => {
  if (enabled && !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error(
      "Integrationstests dürfen nur auf einer Datenbank mit Suffix _test laufen.",
    );
});
afterAll(async () => {
  await db.$disconnect();
});
describe.skipIf(!enabled)("PostgreSQL-Integration", () => {
  beforeEach(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "Appointment", "AvailabilityException", "AvailabilityRule", "_AppointmentTypeToProviderProfile", "AppointmentType", "ProviderProfile", "Session", "User", "Invitation", "AuditLog", "AppSettings", "EmailConfiguration", "RateLimit" CASCADE',
    );
    delete process.env.SETUP_KEY;
  });
  async function fixture() {
    admin = await createInitialAdmin(credentials("admin"));
    provider = await createUser(admin, {
      ...credentials("sister"),
      role: "PROVIDER",
    });
    user = await createUser(admin, { ...credentials("patient"), role: "USER" });
    other = await createUser(admin, { ...credentials("other"), role: "USER" });
    providerId = provider.provider!.id;
    const type = await db.appointmentType.create({
      data: {
        name: "Verbandswechsel",
        duration: 15,
        bufferBefore: 5,
        bufferAfter: 5,
        providers: { connect: { id: providerId } },
      },
    });
    typeId = type.id;
    date = format(addDays(new Date(), 2), "yyyy-MM-dd");
    await saveRules(provider, {
      providerId,
      rules: [
        {
          weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
          startMinute: 1020,
          endMinute: 1200,
        },
      ],
    });
    startsAt = fromZonedTime(`${date}T18:00:00`, "Europe/Berlin").toISOString();
  }
  it("erstellt ersten Admin ohne E-Mail und sperrt Setup dauerhaft", async () => {
    expect(await setupOpen()).toBe(true);
    const a = await createInitialAdmin(credentials("first"));
    expect(a.role).toBe("ADMIN");
    expect(a.email).toBeNull();
    expect(await setupOpen()).toBe(false);
    await expect(createInitialAdmin(credentials("second"))).rejects.toThrow(
      "abgeschlossen",
    );
    await db.user.delete({ where: { id: a.id } });
    expect(await setupOpen()).toBe(false);
    await expect(createInitialAdmin(credentials("third"))).rejects.toThrow(
      "abgeschlossen",
    );
  });
  it("paralleles Setup erzeugt genau einen Admin", async () => {
    const result = await Promise.allSettled([
      createInitialAdmin(credentials("one")),
      createInitialAdmin(credentials("two")),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count({ where: { role: "ADMIN" } })).toBe(1);
  });
  it("prüft Setup-Schlüssel serverseitig", async () => {
    process.env.SETUP_KEY = "installation-test-key";
    await expect(createInitialAdmin(credentials("admin"))).rejects.toThrow(
      "Setup-Schlüssel",
    );
    await expect(
      createInitialAdmin({
        ...credentials("admin"),
        setupKey: "installation-test-key",
      }),
    ).resolves.toMatchObject({ role: "ADMIN" });
  });
  it("Login funktioniert; falsches Passwort und unbekannter Benutzer melden dasselbe", async () => {
    const a = await createInitialAdmin(credentials("admin"));
    expect(await authenticate({ username: "ADMIN", password })).toBe(a.id);
    for (const username of ["admin", "unknown"])
      await expect(
        authenticate({ username, password: "wrong" }),
      ).rejects.toThrow("Benutzername oder Passwort ist falsch.");
    expect(await db.auditLog.count({ where: { action: "LOGIN_FAILED" } })).toBe(
      2,
    );
  });
  it("Invite erstellen und einmalig annehmen, nur Hash gespeichert", async () => {
    const a = await createInitialAdmin(credentials("admin"));
    const invite = await createInvitation(a, {
      role: "PROVIDER",
      email: "sister@example.test",
      expiresAt: addDays(new Date(), 2).toISOString(),
    });
    const secret = invite.link.split("/").pop()!;
    expect(invite.invitation.tokenHash).toBe(digest(secret));
    await expect(
      acceptInvitation(secret, {
        ...credentials("sister"),
        email: "wrong@example.test",
      }),
    ).rejects.toThrow("E-Mail");
    const p = await acceptInvitation(secret, {
      ...credentials("sister"),
      email: "sister@example.test",
    });
    expect(p.role).toBe("PROVIDER");
    expect(p.provider).not.toBeNull();
    await expect(
      acceptInvitation(secret, {
        ...credentials("again"),
        email: "sister@example.test",
      }),
    ).rejects.toThrow("ungültig");
  });
  it.each(["expired", "revoked"])("weist %s Einladung zurück", async (kind) => {
    const a = await createInitialAdmin(credentials("admin"));
    const i = await createInvitation(a, {
      role: "USER",
      expiresAt: addDays(new Date(), 1).toISOString(),
    });
    if (kind === "expired")
      await db.invitation.update({
        where: { id: i.invitation.id },
        data: { expiresAt: addDays(new Date(), -1) },
      });
    else await revokeInvitation(a, i.invitation.id);
    await expect(
      acceptInvitation(i.link.split("/").pop()!, credentials("user")),
    ).rejects.toThrow("ungültig");
  });
  it("parallele Einladungsannahme erstellt genau ein Konto", async () => {
    const a = await createInitialAdmin(credentials("admin"));
    const i = await createInvitation(a, {
      role: "USER",
      expiresAt: addDays(new Date(), 1).toISOString(),
    });
    const secret = i.link.split("/").pop()!;
    const r = await Promise.allSettled([
      acceptInvitation(secret, credentials("one")),
      acceptInvitation(secret, credentials("two")),
    ]);
    expect(r.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count()).toBe(2);
  });
  it("erzwingt Rollen und verhindert fremde Provider-Änderungen", async () => {
    await fixture();
    expect(() => requireRole(user, ["ADMIN"])).toThrow("Berechtigung");
    expect(() => requireRole(provider, ["ADMIN"])).toThrow("Berechtigung");
    expect(() => requireRole(admin, ["ADMIN"])).not.toThrow();
    await expect(createInvitation(user, { role: "ADMIN" })).rejects.toThrow(
      "Berechtigung",
    );
    await expect(saveRules(user, { providerId, rules: [] })).rejects.toThrow(
      "Berechtigung",
    );
    const p2 = await createUser(admin, {
      ...credentials("sister2"),
      role: "PROVIDER",
    });
    await expect(saveRules(p2, { providerId, rules: [] })).rejects.toThrow(
      "Berechtigung",
    );
    await expect(
      updateUser(admin, { id: admin.id, role: "USER", active: true }),
    ).rejects.toThrow("letzte aktive");
  });
  it("berechnet Slots mit Dauer, Puffer und Abwesenheit", async () => {
    await fixture();
    const slots = await availableSlots(providerId, typeId, date);
    expect(slots[0].startsAt).toBe(
      fromZonedTime(`${date}T17:05:00`, "Europe/Berlin").toISOString(),
    );
    expect(slots.at(-1)!.startsAt).toBe(
      fromZonedTime(`${date}T19:40:00`, "Europe/Berlin").toISOString(),
    );
    await addException(provider, {
      providerId,
      startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + 30 * 60000).toISOString(),
      available: false,
    });
    expect(
      (await availableSlots(providerId, typeId, date)).some(
        (s) => s.startsAt === startsAt,
      ),
    ).toBe(false);
  });
  it("parallele Buchungen reservieren denselben Slot nur einmal", async () => {
    await fixture();
    const r = await Promise.allSettled([
      bookAppointment(user, { providerId, typeId, startsAt }),
      bookAppointment(other, { providerId, typeId, startsAt }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.appointment.count()).toBe(1);
    expect(
      (await availableSlots(providerId, typeId, date)).some(
        (s) => s.startsAt === startsAt,
      ),
    ).toBe(false);
  });
  it("Datenbankconstraint schützt auch bei Umgehung der Domänenschicht", async () => {
    await fixture();
    const a = await bookAppointment(user, { providerId, typeId, startsAt });
    await expect(
      db.appointment.create({
        data: {
          userId: other.id,
          providerId,
          typeId,
          typeName: a.typeName,
          startsAt: a.startsAt,
          endsAt: a.endsAt,
          occupiedStart: a.occupiedStart,
          occupiedEnd: a.occupiedEnd,
        },
      }),
    ).rejects.toThrow();
  });
  it("Buchung absagen, IDOR verhindern und Slot freigeben", async () => {
    await fixture();
    const a = await bookAppointment(user, { providerId, typeId, startsAt });
    await expect(
      changeAppointmentStatus(other, { id: a.id, status: "CANCELLED" }),
    ).rejects.toThrow("Berechtigung");
    await expect(
      changeAppointmentStatus(user, { id: a.id, status: "COMPLETED" }),
    ).rejects.toThrow("Berechtigung");
    await changeAppointmentStatus(user, { id: a.id, status: "CANCELLED" });
    expect(
      (await availableSlots(providerId, typeId, date)).some(
        (s) => s.startsAt === startsAt,
      ),
    ).toBe(true);
  });
  it("verschiebt atomar und behält Original bei belegtem Ziel", async () => {
    await fixture();
    const a = await bookAppointment(user, { providerId, typeId, startsAt });
    const target = new Date(
      new Date(startsAt).getTime() + 60 * 60000,
    ).toISOString();
    await bookAppointment(other, { providerId, typeId, startsAt: target });
    await expect(
      bookAppointment(user, {
        providerId,
        typeId,
        startsAt: target,
        appointmentId: a.id,
      }),
    ).rejects.toThrow("verfügbar");
    expect(
      (
        await db.appointment.findUniqueOrThrow({ where: { id: a.id } })
      ).startsAt.toISOString(),
    ).toBe(startsAt);
    const free = new Date(
      new Date(startsAt).getTime() + 30 * 60000,
    ).toISOString();
    await bookAppointment(user, {
      providerId,
      typeId,
      startsAt: free,
      appointmentId: a.id,
    });
    expect(
      (
        await db.appointment.findUniqueOrThrow({ where: { id: a.id } })
      ).startsAt.toISOString(),
    ).toBe(free);
  });
  it("verhindert Abwesenheit über bereits gebuchten Terminen", async () => {
    await fixture();
    const a = await bookAppointment(user, { providerId, typeId, startsAt });
    await expect(
      addException(provider, {
        providerId,
        startsAt: a.occupiedStart.toISOString(),
        endsAt: a.occupiedEnd.toISOString(),
        available: false,
      }),
    ).rejects.toThrow("liegen Termine");
  });
  it("verwendet UTC-Slots auch während Zeitumstellung", async () => {
    await fixture();
    const dstDate = "2026-10-25";
    await saveRules(provider, {
      providerId,
      rules: [{ weekday: 0, startMinute: 0, endMinute: 300 }],
    });
    const slots = await availableSlots(providerId, typeId, dstDate);
    if (
      new Date(dstDate) > new Date() &&
      new Date(dstDate) < addDays(new Date(), 90)
    ) {
      expect(slots.some((s) => s.label === "02:00 +02:00")).toBe(true);
      expect(slots.some((s) => s.label === "02:00 +01:00")).toBe(true);
      expect(new Set(slots.map((s) => s.startsAt)).size).toBe(slots.length);
    }
  });
  it("Rate Limit zählt parallele Requests atomar", async () => {
    const r = await Promise.allSettled(
      Array.from({ length: 8 }, () => rateLimit("test", 3)),
    );
    expect(r.filter((v) => v.status === "fulfilled")).toHaveLength(3);
  });
});
