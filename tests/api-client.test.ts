import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiUnavailableError } from "../src/components/forms";

afterEach(() => vi.unstubAllGlobals());

describe("API client", () => {
  it("meldet JSON-Fehler verständlich", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Konkreter Fehler" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(api("test")).rejects.toThrow("Konkreter Fehler");
  });

  it("behandelt HTML während eines Neustarts als vorübergehende Unterbrechung", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!DOCTYPE html><title>Wird neu gestartet</title>", {
          status: 503,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    await expect(api("updates")).rejects.toBeInstanceOf(ApiUnavailableError);
    await expect(api("updates")).rejects.toThrow(
      "vorübergehend nicht erreichbar",
    );
  });
});
