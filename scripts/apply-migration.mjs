// Applies SQL migration files to this app's own Supabase project via
// SUPABASE_DB_URL (Project settings -> Database -> Connection string -> URI).
//
// Usage: npm run migrate -- supabase/migrations/0000_schema.sql [...]
//        npm run migrate -- --all
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error(
    "SUPABASE_DB_URL is not set. Add it to .env.local (see .env.local.example) " +
      "and run with `npm run migrate` (which loads .env.local via --env-file).",
  );
  process.exit(1);
}

let files = process.argv.slice(2);
if (files[0] === "--all") {
  files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join("supabase/migrations", f));
}
if (files.length === 0) {
  console.error("Usage: npm run migrate -- <sql file> [...]  |  --all");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  for (const file of files) {
    const full = path.resolve(process.cwd(), file);
    const sql = readFileSync(full, "utf8");
    console.log(`Applying ${file} ...`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      console.log("  OK");
    } catch (err) {
      await client.query("rollback");
      console.error(`  FAILED: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end();
}
