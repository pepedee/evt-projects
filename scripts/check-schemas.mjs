// Prints the schemas PostgREST currently exposes on this app's own Supabase
// project, and fails if the app's own `tracker` schema isn't exposed.
//
// Run this after applying 0008_expose_schema.sql.
//
// Usage: npm run check-schemas
import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error(
    "SUPABASE_DB_URL is not set. Add it to .env.local (see .env.local.example) " +
      "and run with `npm run check-schemas` (which loads .env.local via --env-file).",
  );
  process.exit(1);
}

/** This app's own schema. Missing it means the API can't see any of its tables. */
const REQUIRED = ["tracker"];

const client = new pg.Client({
  connectionString,
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
    console.error(`FAIL: required schema(s) not exposed: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("OK: tracker schema is exposed");
  }
} finally {
  await client.end();
}
