import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { db } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/security";

const username = `push_${randomBytes(5).toString("hex")}`;
const password = randomBytes(24).toString("base64url");
let userId: string;
test.beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Nur Testdatenbanken erlaubt.");
  const user = await db.user.create({
    data: {
      username,
      displayName: "Push Test",
      passwordHash: await hashPassword(password),
      role: "PROVIDER",
    },
  });
  userId = user.id;
  await db.appSettings.upsert({
    where: { id: 1 },
    create: { setupCompleted: true },
    update: { setupCompleted: true },
  });
});
test.afterAll(async () => {
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
test.beforeEach(async ({ page }) => {
  await db.pushSubscription.deleteMany({ where: { userId } });
  const response = await page.request.post("/api/login", {
    data: { username, password },
    headers: { origin: "http://localhost:3100" },
  });
  expect(response.ok()).toBeTruthy();
});

async function mockBrowser(
  page: import("@playwright/test").Page,
  initial: "default" | "denied" = "default",
) {
  await page.addInitScript(
    ({ initial }) => {
      let permission = initial as NotificationPermission;
      let subscription: object | null = null;
      const keys = {
        p256dh: btoa(String.fromCharCode(4) + "\0".repeat(64))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, ""),
        auth: "AAAAAAAAAAAAAAAAAAAAAA",
      };
      const manager = {
        getSubscription: async () => subscription,
        subscribe: async (options: object) => {
          subscription = {
            endpoint: "https://fcm.googleapis.com/fcm/send/browser-test",
            options,
            toJSON: () => ({
              endpoint: "https://fcm.googleapis.com/fcm/send/browser-test",
              keys,
            }),
            unsubscribe: async () => {
              subscription = null;
              return true;
            },
          };
          return subscription;
        },
      };
      const registration = {
        pushManager: manager,
        getNotifications: async () => [],
      };
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: {
          get permission() {
            return permission;
          },
          requestPermission: async () => {
            permission = "granted";
            return permission;
          },
        },
      });
      Object.defineProperty(window, "PushManager", {
        configurable: true,
        value: function () {},
      });
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          register: async () => registration,
          getRegistration: async () => registration,
          ready: Promise.resolve(registration),
        },
      });
      Object.defineProperty(window, "allowPush", {
        value: () => {
          permission = "default";
          window.dispatchEvent(new Event("focus"));
        },
      });
    },
    { initial },
  );
}

test("Später, nachträglich aktivieren, Erinnerung ändern, deaktivieren und Abmelden", async ({
  page,
}) => {
  await mockBrowser(page);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Später", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Benachrichtigungen aktivieren" }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Benachrichtigungen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Benachrichtigungen aktivieren" })
    .click();
  await expect(
    page.getByText("Auf diesem Gerät aktiviert.", { exact: true }),
  ).toBeVisible();
  expect(await db.pushSubscription.count({ where: { userId } })).toBe(1);
  await page.getByRole("checkbox", { name: /An eigene Termine/ }).uncheck();
  await expect(page.getByRole("status")).toHaveText(
    "Erinnerungseinstellung gespeichert.",
  );
  expect(
    (await db.pushSubscription.findFirst({ where: { userId } }))?.reminders,
  ).toBe(false);
  await page
    .getByRole("button", { name: "Auf diesem Gerät deaktivieren" })
    .click();
  await expect(
    page.getByRole("button", { name: "Benachrichtigungen aktivieren" }),
  ).toBeVisible();
  expect(await db.pushSubscription.count({ where: { userId } })).toBe(0);
  await page
    .getByRole("button", { name: "Benachrichtigungen aktivieren" })
    .click();
  await expect(
    page.getByText("Auf diesem Gerät aktiviert.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(page).toHaveURL(/login/);
  expect(await db.pushSubscription.count({ where: { userId } })).toBe(0);
});

test("Blockierte Berechtigung erklärt und nach Browseränderung erneut aktivierbar", async ({
  page,
}) => {
  await mockBrowser(page, "denied");
  await page.goto("/settings");
  await expect(
    page.getByText("Benachrichtigungen sind blockiert."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Benachrichtigungen aktivieren" }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    (window as unknown as { allowPush: () => void }).allowPush(),
  );
  await page
    .getByRole("button", { name: "Benachrichtigungen aktivieren" })
    .click();
  await expect(
    page.getByText("Auf diesem Gerät aktiviert.", { exact: true }),
  ).toBeVisible();
});

test("API schützt Push vor anonymen und fremden Anfragen", async ({
  page,
  playwright,
}) => {
  const anonymous = await playwright.request.newContext({
    baseURL: "http://localhost:3100",
  });
  expect((await anonymous.get("/api/push/config")).status()).toBe(401);
  await anonymous.dispose();
  expect(
    (
      await page.request.post("/api/push/subscribe", {
        data: {},
        headers: { origin: "https://foreign.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/push/subscribe", {
        data: { endpoint: "https://127.0.0.1/internal", keys: {} },
        headers: { origin: "http://localhost:3100" },
      })
    ).status(),
  ).toBe(400);
});

test("Service Worker und Installationsmanifest werden ausgeliefert", async ({
  page,
}) => {
  const worker = await page.request.get("/sw.js");
  expect(worker.status()).toBe(200);
  expect(worker.headers()["cache-control"]).toContain("no-store");
  expect(worker.headers()["content-type"]).toMatch(/javascript/);
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons)
    expect((await page.request.get(icon.src)).status()).toBe(200);
  await page.goto("/settings");
  expect(
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js");
      return (await navigator.serviceWorker.ready).active?.scriptURL;
    }),
  ).toContain("/sw.js");
});
