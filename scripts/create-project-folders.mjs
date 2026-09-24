/**
 * Creates a folder on this PC for every project in the tracker, named
 * "<quotation number> <site/client>", each with Report / Photo /
 * Project Documents subfolders.
 *
 *   npm run folders              create whatever is missing
 *   npm run folders -- --dry-run show what would be created, touch nothing
 *
 * Safe to re-run whenever new projects are added: it only ever creates
 * folders that don't exist yet. It never renames, moves or deletes anything,
 * and a project whose folder was renamed by hand (still starting with its
 * quotation number) is recognised and left alone. Cancelled and archived
 * projects are skipped. Reads the database only — writes nothing to it.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT =
  process.env.PROJECT_FOLDERS_ROOT ??
  "C:/Users/iampo/My Drive/Evertech Cooling/Projects";
// "pepe's workspace" — the business's real workspace (see TASKS.md phase 37).
const WORKSPACE_ID =
  process.env.PROJECT_FOLDERS_WORKSPACE ?? "865dc9b6-c93d-45f5-aef6-03af8be689fc";
const SUBFOLDERS = ["Report", "Photo", "Project Documents"];
const MAX_NAME_LENGTH = 45;
const DRY_RUN = process.argv.includes("--dry-run");

/** "Megacooling / Michelin Saraburi — Replace Fill Packs" -> "Megacooling - Michelin Saraburi" */
function shortName(projectName) {
  // The site/client is the part before the first spaced dash; names without
  // one are kept whole (then shortened below).
  let short = projectName.split(/\s+[—–-]\s+/)[0];

  // Characters Windows doesn't allow in a folder name.
  short = short.replace(/\s*[\\/]\s*/g, " - ").replace(/[:*?"<>|]/g, "");
  short = short.replace(/\s+/g, " ").trim();

  if (short.length > MAX_NAME_LENGTH) {
    short = short.slice(0, MAX_NAME_LENGTH).replace(/\s+\S*$/, "");
    // Prefer ending at a natural break over mid-phrase:
    // "Fill Pack & Drift" -> "Fill Pack".
    const breakAt = Math.max(short.lastIndexOf(" & "), short.lastIndexOf(" and "), short.lastIndexOf(","));
    if (breakAt > 10) short = short.slice(0, breakAt);
    // Don't leave half a "(...)" behind after cutting.
    const open = short.lastIndexOf("(");
    if (open !== -1 && short.indexOf(")", open) === -1) short = short.slice(0, open);
  }
  // Windows also rejects a trailing dot or space.
  return short.replace(/[\s.,&-]+$/, "");
}

async function main() {
  if (!process.env.SUPABASE_DB_URL) {
    throw new Error("SUPABASE_DB_URL is not set — run via `npm run folders`.");
  }
  const db = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  const { rows: projects } = await db.query(
    `select code, name from tracker.projects
     where workspace_id = $1 and deleted_at is null and status <> 'cancelled'
       and code is not null
     order by code`,
    [WORKSPACE_ID],
  );
  await db.end();

  if (!DRY_RUN) mkdirSync(ROOT, { recursive: true });
  const existing = existsSync(ROOT) ? readdirSync(ROOT) : [];

  let createdProjects = 0;
  let createdSub = 0;
  for (const { code, name } of projects) {
    // Match on the quotation number, so a folder renamed by hand still counts.
    const match = existing.find((f) => f === code || f.startsWith(`${code} `));
    const folder = match ?? `${code} ${shortName(name)}`.trim();
    const full = path.join(ROOT, folder);

    const missingSub = SUBFOLDERS.filter((s) => !existsSync(path.join(full, s)));
    if (match && missingSub.length === 0) continue;

    console.log(`${match ? "  (exists)" : "+ create "} ${folder}${missingSub.length ? `  [${missingSub.join(", ")}]` : ""}`);
    if (DRY_RUN) continue;

    if (!match) createdProjects++;
    for (const sub of missingSub) {
      mkdirSync(path.join(full, sub), { recursive: true });
      createdSub++;
    }
  }

  console.log(
    DRY_RUN
      ? `\nDry run — nothing created. ${projects.length} projects checked.`
      : `\nDone: ${createdProjects} new project folder(s), ${createdSub} subfolder(s) under ${ROOT}. ${projects.length} projects checked.`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
