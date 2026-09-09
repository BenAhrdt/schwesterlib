import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  configUpsert: vi.fn(),
  appointment: vi.fn(),
  subscriptions: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  device: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    pushConfiguration: { findUnique: mocks.config, upsert: mocks.configUpsert },
    appointment: { findUnique: mocks.appointment },
    pushSubscription: {
      findMany: mocks.subscriptions,
      upsert: mocks.upsert,
      deleteMany: mocks.remove,
      findFirst: mocks.device,
      updateMany: mocks.update,
    },
  },
}));
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: "public", privateKey: "private" }),
    sendNotification: mocks.send,
  },
}));
import {
  appointmentPush,
  deliverPush,
  pushConfiguration,
  pushDevice,
  removePushSubscription,
  savePushSubscription,
  setPushReminders,
  testPush,
  validPushEndpoint,
} from "../src/lib/push";
import { encrypt, decrypt } from "../src/lib/security";
import type { Actor } from "../src/lib/auth";
const actor = { id: "patient" } as Actor;
const sub = {
  id: "device",
  userId: "patient",
  endpoint: "https://fcm.googleapis.com/fcm/send/device",
  p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString(
    "base64url",
  ),
  auth: Buffer.alloc(16).toString("base64url"),
  reminders: true,
  createdAt: new Date(),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  vi.stubEnv("APP_URL", "https://termine.example.org");
  mocks.config.mockResolvedValue({
    publicKey: "public",
    privateKeyEncrypted: encrypt("private"),
  });
  mocks.appointment.mockResolvedValue({
    userId: "patient",
    provider: { user: { id: "provider", role: "PROVIDER", active: true } },
  });
  mocks.subscriptions.mockResolvedValue([sub]);
  mocks.send.mockResolvedValue({ statusCode: 201 });
});
afterEach(() => vi.unstubAllEnvs());
describe("Web Push", () => {
  it.each([
    "http://fcm.googleapis.com/send",
    "https://localhost/push",
    "https://127.0.0.1/push",
    "https://fcm.googleapis.com.evil.org/push",
    "https://fcm.googleapis.com@evil.org/push",
    "https://fcm.googleapis.com:8443/push",
  ])("rejects SSRF endpoint %s", (endpoint) => {
    expect(validPushEndpoint(endpoint)).toBe(false);
  });
  it.each([
    "https://fcm.googleapis.com/send",
    "https://web.push.apple.com/token",
    "https://updates.push.services.mozilla.com/wpush/v2/token",
    "https://wns2-par02p.notify.windows.com/token",
  ])("accepts browser service %s", (endpoint) =>
    expect(validPushEndpoint(endpoint)).toBe(true),
  );
  it("persists only encrypted VAPID private keys", async () => {
    mocks.config.mockResolvedValue(null);
    await pushConfiguration();
    const { create } = mocks.configUpsert.mock.calls[0][0];
    expect(create.privateKeyEncrypted).not.toContain("private");
    expect(decrypt(create.privateKeyEncrypted)).toBe("private");
  });
  it("binds an opt-in to the authenticated account, ignoring a supplied userId", async () => {
    await savePushSubscription(actor, {
      endpoint: sub.endpoint,
      keys: sub,
      userId: "victim",
    });
    expect(mocks.upsert.mock.calls[0][0].create.userId).toBe("patient");
    expect(mocks.upsert.mock.calls[0][0].update.userId).toBe("patient");
  });
  it("does not let another account inspect, delete, test or alter a subscription", async () => {
    mocks.device.mockResolvedValue(null);
    mocks.update.mockResolvedValue({ count: 0 });
    mocks.subscriptions.mockResolvedValue([]);
    expect(await pushDevice(actor, sub)).toEqual({
      active: false,
      reminders: true,
    });
    await removePushSubscription(actor, sub);
    await expect(setPushReminders(actor, sub)).rejects.toThrow(
      "zuerst aktivieren",
    );
    await expect(testPush(actor, sub)).rejects.toThrow("zuerst aktivieren");
    for (const mock of [
      mocks.device,
      mocks.update,
      mocks.remove,
      mocks.subscriptions,
    ])
      expect(mock.mock.calls[0][0].where.userId).toBe("patient");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(["gebucht", "verschoben", "abgesagt"] as const)(
    "notifies both parties on %s without treatment details",
    async (event) => {
      await appointmentPush("appointment", event);
      expect(mocks.subscriptions.mock.calls[0][0].where).toEqual({
        userId: { in: ["patient", "provider"] },
        user: { active: true },
      });
      const payload = JSON.parse(mocks.send.mock.calls[0][1]);
      expect(payload.body).toContain(event);
      expect(payload.body).not.toMatch(/patient|provider|Verbandswechsel/);
      expect(payload.url).toBe("/dashboard");
    },
  );
  it("excludes inactive providers and deduplicates recipients", async () => {
    mocks.appointment.mockResolvedValue({
      userId: "patient",
      provider: { user: { id: "provider", role: "PROVIDER", active: false } },
    });
    await appointmentPush("id", "gebucht");
    expect(mocks.subscriptions.mock.calls[0][0].where.userId.in).toEqual([
      "patient",
    ]);
    mocks.appointment.mockResolvedValue({
      userId: "patient",
      provider: { user: { id: "patient", role: "PROVIDER", active: true } },
    });
    await appointmentPush("id", "gebucht");
    expect(mocks.subscriptions.mock.calls[1][0].where.userId.in).toEqual([
      "patient",
    ]);
  });
  it.each([404, 410])("removes expired devices on %s", async (statusCode) => {
    mocks.send.mockRejectedValue({ statusCode });
    await deliverPush([sub], "Neutral", "test");
    expect(mocks.remove).toHaveBeenCalledWith({
      where: { id: sub.id, userId: sub.userId, auth: sub.auth },
    });
  });
  it("attempts all devices and retains transient failures without exposing secrets", async () => {
    mocks.send.mockRejectedValueOnce(new Error("secret-endpoint"));
    await expect(
      deliverPush([sub, { ...sub, id: "second" }], "Neutral", "test"),
    ).rejects.toThrow("Mindestens eine Push-Nachricht");
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("does not configure or send anything without subscriptions", async () => {
    await deliverPush([], "Neutral", "test");
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
