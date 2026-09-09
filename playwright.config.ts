import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";

const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith("_test")) {
  throw new Error(
    "TEST_DATABASE_URL muss auf eine separate Datenbank mit Suffix _test zeigen.",
  );
}
process.env.DATABASE_URL = database;
process.env.APP_URL = "http://localhost:3100";
process.env.SESSION_SECRET = randomBytes(48).toString("base64url");
process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.SETUP_KEY = "browser-test-setup";
process.env.PUSH_REMINDERS_DISABLED = "true";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  use: { baseURL: process.env.APP_URL, headless: true },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 180000,
  },
});
