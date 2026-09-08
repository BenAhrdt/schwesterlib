import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  digest,
  token,
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
} from "../src/lib/security";
import { credentialsSchema, providerSchema } from "../src/lib/validation";
import { overlap } from "../src/lib/scheduling";
describe("Sicherheitsgrundlagen", () => {
  it("erzeugt nicht rekonstruierbare Token-Hashes", () => {
    const a = token();
    expect(a).not.toBe(token());
    expect(digest(a)).toHaveLength(64);
    expect(digest(a)).not.toContain(a);
  });
  it("verschlüsselt SMTP-Passwörter mit authentifizierter Verschlüsselung", () => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
    const c = encrypt("smtp-password");
    expect(c).not.toContain("smtp-password");
    expect(decrypt(c)).toBe("smtp-password");
    expect(() => decrypt(c.slice(0, -4) + "AAAA")).toThrow();
  });
  it("speichert Argon2id und prüft falsche Passwörter", async () => {
    const h = await hashPassword("A very long test password!");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "A very long test password!")).toBe(true);
    expect(await verifyPassword(h, "incorrect")).toBe(false);
  });
  it("weist kurze und abweichende Passwörter ab", () => {
    expect(
      credentialsSchema.safeParse({
        username: "test",
        displayName: "Test",
        password: "short",
        passwordConfirm: "different",
      }).success,
    ).toBe(false);
  });
  it("verhindert unsichere Profilbild-URLs", () => {
    expect(
      providerSchema.safeParse({
        id: "p",
        specialty: "",
        description: "",
        location: "",
        qualifications: "",
        imageUrl: "javascript:alert(1)",
        timezone: "Europe/Berlin",
        active: true,
      }).success,
    ).toBe(false);
  });
  it("behandelt aneinandergrenzende Zeitbereiche als frei", () => {
    const t = (n: number) => new Date(n);
    expect(overlap(t(0), t(10), t(10), t(20))).toBe(false);
    expect(overlap(t(0), t(11), t(10), t(20))).toBe(true);
  });
});
