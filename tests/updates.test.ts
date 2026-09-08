import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requestUpdate, updateInfo } from "../src/lib/updates";

const release = (tag: string) =>
  new Response(
    JSON.stringify({
      tag_name: tag,
      name: `Release ${tag}`,
      body: "Sichere Release-Hinweise",
      html_url: `https://github.com/BenAhrdt/schwesterlib/releases/tag/${tag}`,
      published_at: "2026-09-08T00:00:00Z",
    }),
    { status: 200 },
  );

describe("Web-Updates", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "schwesterlib-update-"));
    process.env.UPDATE_REQUEST_PATH = join(directory, "request");
    process.env.UPDATE_STATUS_PATH = join(directory, "status.json");
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.UPDATE_REQUEST_PATH;
    delete process.env.UPDATE_STATUS_PATH;
    await rm(directory, { recursive: true, force: true });
  });
  it("erkennt ein neueres veröffentlichtes Release", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(release("v1.3.0")));
    const info = await updateInfo();
    expect(info.currentVersion).toBe("1.2.0");
    expect(info.latestVersion).toBe("v1.3.0");
    expect(info.updateAvailable).toBe(true);
    expect(info.configured).toBe(true);
    expect(info.status.state).toBe("idle");
  });
  it("akzeptiert nur exakt das neueste, wirklich neuere Release", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(release("v1.3.0")));
    vi.stubGlobal("fetch", fetch);
    await expect(requestUpdate("v9.9.9")).rejects.toThrow("steht nicht");
    await requestUpdate("v1.3.0");
    expect(await readFile(process.env.UPDATE_REQUEST_PATH!, "utf8")).toBe(
      "v1.3.0\n",
    );
    await expect(requestUpdate("v1.3.0")).rejects.toThrow("bereits");
  });
  it("lehnt ungültige Release-Metadaten und fehlende Einrichtung ab", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(release("latest")));
    await expect(updateInfo()).rejects.toThrow("ungültige Metadaten");
    delete process.env.UPDATE_REQUEST_PATH;
    await expect(requestUpdate("v1.3.0")).rejects.toThrow(
      "noch nicht eingerichtet",
    );
  });
});
