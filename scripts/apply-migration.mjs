// Applies SQL migration files to the shared Supabase project through the
// session pooler. The direct db.<ref>.supabase.co host fails DNS/IPv6 here.
//
// Usage: npm run migrate -- supabase/migrations/0000_schema.sql [...]
//        npm run migrate -- --all
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = "lfpsnhuarpdlzrsnycmo";
const PASSWORD_FILE = path.join(
  __dirname,
  "..",
  "..",
  "daily-budget-app",
  ".supabase-db-password.txt",
);
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

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

const password = readFileSync(PASSWORD_FILE, "utf8").trim();

const client = new pg.Client({
  host: "aws-0-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: `postgres.${PROJECT_REF}`,
  password,
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
