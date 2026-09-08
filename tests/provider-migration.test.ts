import { it, expect } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

it.skipIf(!process.env.DATABASE_URL)(
  "Migration erhält Admin, Setup-Sperre und Termine und ergänzt offene Behandlerentwürfe",
  async () => {
    const url = process.env.DATABASE_URL!;
    if (!new URL(url).pathname.endsWith("_test"))
      throw new Error("Nur Testdatenbank erlaubt.");
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query("BEGIN");
      const schema = `migration_check_${randomBytes(8).toString("hex")}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}", public`);
      await client.query(
        readFileSync(
          "prisma/migrations/202609080001_initial/migration.sql",
          "utf8",
        ),
      );
      await client.query(`
      INSERT INTO "User" (id, username, "displayName", "passwordHash", role) VALUES ('admin', 'admin', 'Admin', 'fixture', 'ADMIN');
      INSERT INTO "AppSettings" (id, "setupCompleted") VALUES (1, true);
      INSERT INTO "ProviderProfile" (id, "userId") VALUES ('existing', 'admin');
      INSERT INTO "AppointmentType" (id, name, duration) VALUES ('type', 'Termin', 15);
      INSERT INTO "Appointment" (id, "userId", "providerId", "typeId", "typeName", "startsAt", "endsAt", "occupiedStart", "occupiedEnd")
        VALUES ('appointment', 'admin', 'existing', 'type', 'Termin', now(), now() + interval '15 minutes', now(), now() + interval '15 minutes');
      INSERT INTO "Invitation" (id, "tokenHash", role, status, "expiresAt", "createdBy") VALUES
        ('open', 'hash-open', 'PROVIDER', 'OPEN', now() + interval '1 day', 'admin'),
        ('revoked', 'hash-revoked', 'PROVIDER', 'REVOKED', now() + interval '1 day', 'admin'),
        ('ordinary', 'hash-user', 'USER', 'OPEN', now() + interval '1 day', 'admin');
    `);
      await client.query(
        readFileSync(
          "prisma/migrations/202609080002_provider_drafts_notifications/migration.sql",
          "utf8",
        ),
      );
      expect(
        (await client.query('SELECT "setupCompleted" FROM "AppSettings"')).rows,
      ).toEqual([{ setupCompleted: true }]);
      expect((await client.query('SELECT id, role FROM "User"')).rows).toEqual([
        { id: "admin", role: "ADMIN" },
      ]);
      expect((await client.query('SELECT id FROM "Appointment"')).rows).toEqual(
        [{ id: "appointment" }],
      );
      expect(
        (
          await client.query(
            'SELECT "userId", "invitationId", "emailNotifications" FROM "ProviderProfile" ORDER BY id',
          )
        ).rows,
      ).toEqual([
        { userId: null, invitationId: "open", emailNotifications: false },
        { userId: "admin", invitationId: null, emailNotifications: false },
      ]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  },
);
