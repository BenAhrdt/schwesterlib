import "dotenv/config";
try {
  const database = new URL(process.env.DATABASE_URL);
  const app = new URL(process.env.APP_URL);
  const valid =
    Number(process.versions.node.split(".")[0]) >= 22 &&
    ["localhost", "127.0.0.1"].includes(database.hostname) &&
    (database.port || "5432") === "5432" &&
    database.pathname === "/schwesterlib" &&
    decodeURIComponent(database.username) === "schwesterlib" &&
    decodeURIComponent(database.password) === process.env.POSTGRES_PASSWORD &&
    Boolean(process.env.POSTGRES_PASSWORD) &&
    app.protocol === "https:" &&
    app.origin === process.env.APP_URL &&
    (process.env.SESSION_SECRET?.length ?? 0) >= 32 &&
    /^[a-fA-F0-9]{64}$/.test(process.env.ENCRYPTION_KEY ?? "") &&
    Boolean(process.env.SETUP_KEY) &&
    ["true", "false"].includes(process.env.TRUST_PROXY ?? "");
  if (!valid) throw new Error();
} catch {
  console.error("Produktionskonfiguration ungültig. Vorgaben in docs/PRODUCTION.md prüfen.");
  process.exitCode = 1;
}
