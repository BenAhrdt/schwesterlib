import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  appointment: vi.fn(),
  count: vi.fn(),
  config: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    appointment: { findUnique: mocks.appointment },
    emailConfiguration: { count: mocks.count, findUnique: mocks.config },
  },
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: mocks.send }) },
}));
import { appointmentMail } from "../src/lib/mail";

const appointment = (email: string | null = "patient@example.org") => ({
  user: { email },
  provider: {
    emailNotifications: true,
    user: { email: "sister@example.org", active: true, role: "PROVIDER" },
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.count.mockResolvedValue(1);
  mocks.config.mockResolvedValue({
    host: "smtp.example.org",
    port: 465,
    secure: true,
    username: "",
    senderName: "SchwesterLib",
    senderAddress: "mail@example.org",
  });
  mocks.send.mockResolvedValue({});
  mocks.appointment.mockResolvedValue(appointment());
});
describe("Terminbenachrichtigungen", () => {
  it.each(["gebucht", "verschoben", "abgesagt"] as const)(
    "benachrichtigt beide Seiten bei %s ohne Gesundheitsdetails",
    async (event) => {
      await appointmentMail("id", event);
      expect(mocks.send.mock.calls.map(([mail]) => mail.to).sort()).toEqual([
        "patient@example.org",
        "sister@example.org",
      ]);
      for (const [mail] of mocks.send.mock.calls) {
        expect(mail.subject).toContain(event);
        expect(mail.text).toContain("/dashboard");
        expect(mail.text).not.toContain("Verbandswechsel");
      }
    },
  );
  it("sendet an Behandler auch ohne Patientenadresse", async () => {
    mocks.appointment.mockResolvedValue(appointment(null));
    await appointmentMail("id", "gebucht");
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][0].to).toBe("sister@example.org");
  });
  it("respektiert ausgeschaltete Benachrichtigungen und fehlendes SMTP", async () => {
    const data = appointment();
    data.provider.emailNotifications = false;
    mocks.appointment.mockResolvedValue(data);
    await appointmentMail("id", "abgesagt");
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][0].to).toBe("patient@example.org");
    mocks.send.mockClear();
    mocks.count.mockResolvedValue(0);
    await appointmentMail("id", "gebucht");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("versucht den zweiten Empfänger auch bei einem Versandfehler", async () => {
    mocks.send.mockRejectedValueOnce(new Error("secret smtp response"));
    await expect(appointmentMail("id", "gebucht")).rejects.toThrow(
      "Mindestens eine Terminbenachrichtigung",
    );
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
  it("vermeidet doppelte Nachrichten an dieselbe Adresse", async () => {
    mocks.appointment.mockResolvedValue(appointment("sister@example.org"));
    await appointmentMail("id", "gebucht");
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});
