import { describe, it, expect, vi, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { appSettings: { findUnique } } }));
import { GET } from "../src/app/api/health/route";

afterEach(() => vi.resetAllMocks());
describe("Production health", () => {
  it("reports database readiness without exposing settings", async () => {
    findUnique.mockResolvedValue({ id: 1 });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
  it("returns 503 without leaking database errors", async () => {
    findUnique.mockRejectedValue(
      new Error("postgresql://secret:password@host/db"),
    );
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});

it("rejects a mismatched backup database and HTTP origin without logging secrets", () => {
  const directory = mkdtempSync(join(tmpdir(), "schwesterlib-config-"));
  const script = resolve("scripts/check-production.mjs");
  const env = {
    ...process.env,
    DATABASE_URL:
      "postgresql://schwesterlib:test-password@127.0.0.1:5432/schwesterlib",
    POSTGRES_PASSWORD: "test-password",
    APP_URL: "https://appointments.example.org",
    SESSION_SECRET: "s".repeat(48),
    ENCRYPTION_KEY: "a".repeat(64),
    SETUP_KEY: "test-setup-key",
    TRUST_PROXY: "false",
  };
  try {
    expect(
      spawnSync(process.execPath, [script], { cwd: directory, env }).status,
    ).toBe(0);
    for (const change of [
      { DATABASE_URL: env.DATABASE_URL.replace("5432", "55432") },
      { APP_URL: "http://appointments.example.org" },
      { POSTGRES_PASSWORD: "different-secret" },
    ]) {
      const result = spawnSync(process.execPath, [script], {
        cwd: directory,
        env: { ...env, ...change },
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).not.toMatch(
        /test-password|different-secret|postgresql:/,
      );
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});
