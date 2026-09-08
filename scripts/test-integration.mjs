import { spawnSync } from "node:child_process";
const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith("_test")) {
  console.error(
    "TEST_DATABASE_URL muss auf eine separate Datenbank mit Suffix _test zeigen.",
  );
  process.exit(1);
}
const env = { ...process.env, DATABASE_URL: database, NODE_ENV: "test" };
for (const args of [
  ["prisma", "migrate", "deploy"],
  ["vitest", "run"],
]) {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    args,
    { env, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
