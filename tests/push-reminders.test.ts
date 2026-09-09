import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  candidates: vi.fn(),
  lock: vi.fn(),
  appointment: vi.fn(),
  subscriptions: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    appointment: { findMany: mocks.candidates },
    $transaction: async (run: (tx: unknown) => Promise<void>) =>
      run({
        $queryRaw: mocks.lock,
        appointment: { findFirst: mocks.appointment, update: mocks.update },
        pushSubscription: { findMany: mocks.subscriptions },
      }),
  },
}));
vi.mock("@/lib/push", () => ({ deliverPush: mocks.send }));
import { sendDuePushReminders } from "../src/lib/push-reminders";
const now = new Date("2026-09-09T10:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.candidates.mockResolvedValue([
    { id: "appointment", providerId: "provider" },
  ]);
  mocks.lock.mockResolvedValue([{ locked: true }]);
  mocks.appointment.mockResolvedValue({
    id: "appointment",
    userId: "patient",
    startsAt: new Date("2026-09-10T10:00:00Z"),
  });
  mocks.subscriptions.mockResolvedValue([{ id: "device" }]);
});
describe("Push reminders", () => {
  it("selects only upcoming active appointments with opted-in users", async () => {
    await sendDuePushReminders(now);
    expect(mocks.candidates.mock.calls[0][0].where).toMatchObject({
      status: { in: ["PENDING", "CONFIRMED"] },
      pushReminderAt: null,
      startsAt: {
        gt: new Date("2026-09-09T10:05:00Z"),
        lte: new Date("2026-09-10T10:00:00Z"),
      },
      user: { active: true, pushSubscriptions: { some: { reminders: true } } },
    });
    expect(mocks.subscriptions.mock.calls[0][0].where).toEqual({
      userId: "patient",
      reminders: true,
      user: { active: true },
    });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.update.mock.calls[0][0].data.pushReminderAt).toEqual(now);
  });
  it("skips a provider locked by another worker or a booking change", async () => {
    mocks.lock.mockResolvedValue([{ locked: false }]);
    await sendDuePushReminders(now);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rechecks cancellation, rescheduling and previous delivery under the lock", async () => {
    mocks.appointment.mockResolvedValue(null);
    await sendDuePushReminders(now);
    expect(mocks.appointment.mock.calls[0][0].where.pushReminderAt).toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not mark failures as sent, allowing retry", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.send.mockRejectedValue(new Error("private-endpoint"));
    await sendDuePushReminders(now);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(warning.mock.calls.flat().join(" ")).not.toContain(
      "private-endpoint",
    );
    warning.mockRestore();
  });
});
