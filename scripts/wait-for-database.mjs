import "dotenv/config";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL fehlt.");
  process.exit(1);
}
for (let attempt = 0; attempt < 15; attempt++) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
  });
  try {
    await client.connect();
    await client.query('SELECT "setupCompleted" FROM "AppSettings" LIMIT 1');
    await client.end();
    process.exit(0);
  } catch {
    await client.end().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
console.error("Datenbank oder Anwendungsschema nicht bereit.");
process.exit(1);
