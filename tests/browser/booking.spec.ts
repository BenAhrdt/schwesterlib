import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { db } from "../../src/lib/db";
import { addDays, format } from "date-fns";

const password = randomBytes(24).toString("base64url");
const credentials = (username: string) => ({
  username,
  displayName: username,
  password,
  passwordConfirm: password,
  email: "",
});
async function post(request: APIRequestContext, path: string, data: unknown) {
  const response = await request.post(`/api/${path}`, {
    data,
    headers: { origin: "http://localhost:3100" },
  });
  expect(response.ok(), `${path}: ${response.status()}`).toBeTruthy();
  return response.json();
}
test.beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Nur Testdatenbanken erlaubt.");
  await db.$executeRawUnsafe(
    'TRUNCATE "Appointment", "AvailabilityException", "AvailabilityRule", "_AppointmentTypeToProviderProfile", "AppointmentType", "ProviderProfile", "Session", "User", "Invitation", "AuditLog", "AppSettings", "EmailConfiguration", "RateLimit" CASCADE',
  );
});
test.afterAll(async () => {
  await db.$disconnect();
});

test("Setup, Einladung, mobile Buchung, Verschieben, Absage und API-Rechte", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/setup");
  await page.getByLabel("Benutzername", { exact: true }).fill("admin");
  await page.getByLabel("Anzeigename", { exact: true }).fill("Administrator");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByLabel("Passwort bestätigen").fill(password);
  await page.getByLabel("Setup-Schlüssel").fill("browser-test-setup");
  await page.getByRole("button", { name: "SchwesterLib einrichten" }).click();
  await expect(page).toHaveURL(/dashboard/);
  expect(
    (
      await page.request.post("/api/setup", {
        data: { ...credentials("second"), setupKey: "browser-test-setup" },
        headers: { origin: "http://localhost:3100" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/users", {
        data: {},
        headers: { origin: "https://foreign.example" },
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.get("/register")).status()).toBe(404);

  await page.goto("/admin/invitations");
  await page.getByLabel("Anzeigename (optional)").fill("Schwester Anna");
  await page.getByLabel("Rolle", { exact: true }).selectOption("PROVIDER");
  await page
    .getByRole("button", { name: "Einladung erstellen", exact: true })
    .click();
  const invite = page.getByRole("textbox", {
    name: "Einladungslink",
    exact: true,
  });
  await expect(invite).toBeVisible();
  const link = await invite.inputValue();
  const providerContext = await browser.newContext({
    baseURL: "http://localhost:3100",
  });
  const providerPage = await providerContext.newPage();
  await providerPage.goto(link);
  await providerPage.getByLabel("Benutzername", { exact: true }).fill("sister");
  await providerPage.getByLabel("Passwort", { exact: true }).fill(password);
  await providerPage.getByLabel("Passwort bestätigen").fill(password);
  await providerPage.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(providerPage).toHaveURL(/dashboard/);
  expect((await providerContext.request.get("/api/users")).status()).toBe(403);
  expect(
    (
      await providerContext.request.post("/api/invitations", {
        data: {},
        headers: { origin: "http://localhost:3100" },
      })
    ).status(),
  ).toBe(403);
  const providers = await (await page.request.get("/api/providers")).json();
  const providerId = providers[0].id;
  await post(page.request, "types", {
    name: "Verbandswechsel",
    duration: 15,
    bufferBefore: 5,
    bufferAfter: 5,
    active: true,
    providerIds: [providerId],
  });
  const date = format(addDays(new Date(), 2), "yyyy-MM-dd");
  await providerPage.goto("/provider/availability");
  await providerPage
    .getByRole("button", { name: "Zeitfenster", exact: true })
    .click();
  await providerPage
    .getByLabel("Wochentag")
    .selectOption(String(new Date(`${date}T12:00:00Z`).getUTCDay()));
  await providerPage
    .getByRole("button", { name: "Wochenplan speichern" })
    .click();
  await expect(providerPage.getByText("Wochenplan gespeichert.")).toBeVisible();
  await post(page.request, "users", {
    ...credentials("patient"),
    role: "USER",
  });

  const patientContext = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: { width: 390, height: 844 },
  });
  const patient = await patientContext.newPage();
  patient.on("pageerror", (e) => errors.push(e.message));
  await patient.goto("/");
  expect(
    await patient.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await patient.goto("/login");
  await patient.getByLabel("Benutzername", { exact: true }).fill("patient");
  await patient.getByLabel("Passwort", { exact: true }).fill("wrong-password");
  await patient.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(patient.getByRole("alert")).toContainText(
    "Benutzername oder Passwort ist falsch",
  );
  await patient.getByLabel("Passwort", { exact: true }).fill(password);
  await patient.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(patient).toHaveURL(/dashboard/);
  expect((await patientContext.request.get("/api/users")).status()).toBe(403);
  expect((await patientContext.request.get("/api/smtp")).status()).toBe(403);
  await patient.goto("/book");
  await patient.getByRole("button", { name: /Schwester Anna/ }).click();
  await patient.getByRole("button", { name: /Verbandswechsel/ }).click();
  await patient.getByLabel(/Datum · Zeitzone/).fill(date);
  await patient.locator(".slots button").first().click();
  await patient
    .getByRole("button", { name: "Termin verbindlich buchen" })
    .click();
  await expect(
    patient.getByText("Ihr Termin wurde erfolgreich gebucht."),
  ).toBeVisible();
  expect(
    await patient.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await patient.goto("/appointments");
  await patient.getByRole("button", { name: "Details", exact: true }).click();
  await patient
    .getByRole("button", { name: "Verschieben", exact: true })
    .click();
  await patient.getByLabel(/Datum · Zeitzone/).fill(date);
  await patient.locator(".slots button").last().click();
  await patient
    .getByRole("button", { name: "Termin verbindlich verschieben" })
    .click();
  await expect(
    patient.getByText("Dein Termin wurde verschoben."),
  ).toBeVisible();
  await patient.goto("/appointments");
  await patient.getByRole("button", { name: "Details", exact: true }).click();
  await patient.getByRole("button", { name: "Absagen", exact: true }).click();
  await patient.getByRole("button", { name: "Verbindlich absagen" }).click();
  await expect(
    patient.getByText("Hier gibt es noch keine Termine."),
  ).toBeVisible();
  await patient
    .getByRole("button", { name: "Vergangene & abgesagte Termine" })
    .click();
  await expect(patient.locator(".status.cancelled")).toHaveText("Abgesagt");
  await page.goto("/admin/calendar");
  for (const view of ["Tag", "Woche", "Monat"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.locator(".calendar-grid")).toBeVisible();
  }
  expect(errors).toEqual([]);
  await patientContext.close();
  await providerContext.close();
});
