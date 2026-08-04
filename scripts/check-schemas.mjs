// Prints the schemas PostgREST currently exposes on the shared Supabase
// project, and fails if a sibling app's schema has gone missing.
//
// Run this before and after applying 0008_expose_schema.sql. That migration
// appends to the list; if it were ever rewritten to assign a fixed list, this
// is what catches it before the sibling apps go down.
//
// Usage: node scripts/check-schemas.mjs
import { readFileSync } from "fs";
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

/** Schemas the sibling apps depend on. Losing any of these takes them offline. */
const REQUIRED = ["public", "agency", "bakery"];

const client = new pg.Client({
  host: "aws-0-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: `postgres.${PROJECT_REF}`,
  password: readFileSync(PASSWORD_FILE, "utf8").trim(),
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const { rows } = await client.query(`
    select cfg
    from pg_db_role_setting s
    join pg_roles r on r.oid = s.setrole,
         unnest(s.setconfig) as cfg
    where r.rolname = 'authenticator' and cfg like 'pgrst.db_schemas=%'
  `);

  if (rows.length === 0) {
    console.log("pgrst.db_schemas is not set (defaults apply)");
    process.exit(0);
  }

  const list = rows[0].cfg.replace("pgrst.db_schemas=", "");
  const exposed = list.split(",").map((s) => s.trim());
  console.log(`exposed: ${exposed.join(", ")}`);

  const missing = REQUIRED.filter((s) => !exposed.includes(s));
  if (missing.length > 0) {
    console.error(`FAIL: sibling schemas no longer exposed: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("OK: every sibling schema is still exposed");
  }
} finally {
  await client.end();
}
