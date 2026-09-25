/**
 * The "inbox": files the owner drops into their Google Drive folders get
 * picked up and filed into the tracker. Run hourly by a Claude scheduled
 * task; safe to run by hand any time.
 *
 *   npm run inbox                  process anything new
 *   npm run inbox -- --dry-run     read and report, change nothing
 *   npm run inbox -- --baseline    mark everything already there as seen
 *   npm run inbox -- --file <pdf> --doc <json> [--dry-run]
 *                                  record one document already read by
 *                                  someone else (no API credit needed)
 *
 * Jobs:
 *   1. Quotation 2026/*.pdf with a new quotation number -> new project
 *      (same AI import as /projects/import) + its PC folder
 *   2. A customer PO (in a project's "Project Documents", or in
 *      "Projects/_Accounting/PO from Customer") -> project marked PO
 *      received, with no./date
 *   3. Images in a project's "Photo" folder -> uploaded to its Files
 *   4. Evertech invoices / receipts ("Projects/_Accounting/Invoices" and
 *      "/Receipts", or a project's "Project Documents") -> the matching
 *      payment term invoiced / paid
 *
 * Ground rules: every job is idempotent on its own (a duplicate project,
 * photo, PO or payment is detected even if the ledger is lost); anything
 * that can't be matched to exactly one project/payment is reported under
 * "Needs review" and left untouched rather than guessed; every change is
 * written to the activity log as "Auto: ...". The ledger
 * (.inbox-ledger.json) only saves re-reading unchanged files.
 */
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { extractProjectFromPdf } from "../lib/ai/import";
import { readBusinessDocument, type BusinessDocument } from "../lib/ai/business-document";
import { BUCKET, MAX_UPLOAD_BYTES, buildStoragePath } from "../lib/storage";

const DRIVE = process.env.INBOX_DRIVE_ROOT ?? "C:/Users/iampo/My Drive";
const ACCOUNTING = `${DRIVE}/Evertech Cooling/Projects/_Accounting`;
const SOURCES = {
  quotations: `${DRIVE}/Evertech Cooling/Quotation 2026`,
  projects: `${DRIVE}/Evertech Cooling/Projects`,
  // Subfolders (e.g. a year folder) are read too. "_Accounting/PO for
  // Supplier" is deliberately not watched: those are Evertech's own orders
  // to suppliers, not customers committing to a job.
  customerPOs: `${ACCOUNTING}/PO from Customer`,
  invoices: `${ACCOUNTING}/Invoices`,
  receipts: `${ACCOUNTING}/Receipts`,
};
// "pepe's workspace" and its owner (bozosx@gmail.com) — see TASKS.md phase 37.
// Overridable only so a test run can target a throwaway account.
const WORKSPACE_ID = process.env.INBOX_WORKSPACE ?? "865dc9b6-c93d-45f5-aef6-03af8be689fc";
const OWNER_ID = process.env.INBOX_OWNER ?? "bdf6c953-ee2d-43cc-9e54-f0a4d26581db";

const ROOT = path.resolve(__dirname, "..");
const STATE_DIR = process.env.INBOX_STATE_DIR ?? ROOT;
const LEDGER_FILE = path.join(STATE_DIR, ".inbox-ledger.json");
const LOCK_FILE = path.join(STATE_DIR, ".inbox.lock");
/** Google Drive may still be writing a just-dropped file; pick it up next run. */
const SETTLE_MS = 2 * 60 * 1000;

const DRY_RUN = process.argv.includes("--dry-run");
const BASELINE = process.argv.includes("--baseline");
const argAfter = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};
const PREREAD = argAfter("--file") && argAfter("--doc") ? { file: argAfter("--file")!, doc: argAfter("--doc")! } : null;

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// ------------------------------------------------------------------ report

const report = { done: [] as string[], review: [] as string[], info: [] as string[] };
const rel = (file: string) => path.relative(DRIVE, file).replaceAll("\\", "/");

// ------------------------------------------------------------------ ledger

type LedgerEntry = { size: number; mtimeMs: number; outcome: string; at: string };
const ledger: Record<string, LedgerEntry> = existsSync(LEDGER_FILE)
  ? JSON.parse(readFileSync(LEDGER_FILE, "utf8"))
  : {};

function fileState(file: string) {
  const st = statSync(file);
  return { size: st.size, mtimeMs: Math.round(st.mtimeMs) };
}

/** New = never seen, or changed since. Still-syncing files wait for next run. */
function isNew(file: string): boolean {
  const s = fileState(file);
  if (Date.now() - s.mtimeMs < SETTLE_MS) return false;
  const e = ledger[file];
  return !e || e.size !== s.size || e.mtimeMs !== s.mtimeMs;
}

function markSeen(file: string, outcome: string) {
  if (DRY_RUN) return;
  ledger[file] = { ...fileState(file), outcome, at: new Date().toISOString() };
}

// ------------------------------------------------------------------ files

function listFiles(dir: string, recursive = false): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...listFiles(full, true));
    } else if (!entry.name.startsWith("~$") && !entry.name.startsWith(".")) {
      out.push(full);
    }
  }
  return out;
}

const isPdf = (f: string) => path.extname(f).toLowerCase() === ".pdf";

/** PDFs in an _Accounting folder, including any subfolders (e.g. by year). */
const accountingPdfs = (dir: string) => listFiles(dir, true).filter(isPdf);

// ------------------------------------------------------------------ codes

/** "EVT26QT045R01_..." -> { base: "EVT26QT045", code: "EVT26QT045R01" } */
function parseCode(text: string): { base: string; code: string } | null {
  const m = text.toUpperCase().match(/([A-Z]{2,4}\d{2}QT\d{3,4})((?:[\s_-]*(?:R|REV)\.?\s*0*\d{1,2}(?![0-9])))?/);
  if (!m) return null;
  return { base: m[1], code: (m[1] + (m[2] ?? "")).replace(/[\s_.-]/g, "").replace("REV", "R") };
}

interface ProjectLite {
  id: string;
  code: string | null;
  name: string;
  currency: string;
  po_status: "waiting" | "received" | "lost";
  po_number: string | null;
  po_date: string | null;
}

let projects: ProjectLite[] = [];

function projectsWithBase(base: string) {
  return projects.filter((p) => p.code && parseCode(p.code)?.base === base);
}

/** One project for these quotation references, or why not. */
function resolveProject(refs: string[]): { project: ProjectLite } | { problem: string } {
  const found = new Map<string, ProjectLite>();
  for (const ref of refs) {
    const parsed = parseCode(ref);
    if (!parsed) continue;
    const exact = projects.find((p) => p.code?.toUpperCase() === parsed.code);
    if (exact) {
      found.set(exact.id, exact);
      continue;
    }
    const byBase = projectsWithBase(parsed.base);
    if (byBase.length === 1) found.set(byBase[0].id, byBase[0]);
    else if (byBase.length > 1)
      return { problem: `${ref} could be ${byBase.map((p) => p.code).join(" or ")}` };
  }
  if (found.size === 1) return { project: [...found.values()][0] };
  if (found.size === 0)
    return {
      problem: refs.length
        ? `no project for quotation ${refs.join(", ")}`
        : "no quotation number printed on it to match a project",
    };
  return { problem: `refers to several projects (${[...found.values()].map((p) => p.code).join(", ")})` };
}

// ------------------------------------------------------------------ db

let db: pg.Client;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function loadProjects() {
  const { rows } = await db.query<ProjectLite>(
    `select id, code, name, currency, po_status, po_number, po_date::text
     from tracker.projects where workspace_id = $1 and deleted_at is null`,
    [WORKSPACE_ID],
  );
  projects = rows;
}

async function log(entity: string, entityId: string, action: string, summary: string, after?: unknown) {
  await db.query(
    `insert into tracker.activity_logs (workspace_id, actor_id, entity, entity_id, action, summary, after)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [WORKSPACE_ID, OWNER_ID, entity, entityId, action, `Auto: ${summary}`, after ? JSON.stringify(after) : null],
  );
}

// ------------------------------------------------ job 1: new quotations

async function processQuotations(): Promise<number> {
  const pdfs = listFiles(SOURCES.quotations).filter(isPdf);
  const groups = new Map<string, string[]>();
  for (const f of pdfs) {
    const parsed = parseCode(path.basename(f));
    if (!parsed) continue;
    groups.set(parsed.base, [...(groups.get(parsed.base) ?? []), f]);
  }

  let created = 0;
  for (const [base, files] of groups) {
    const fresh = files.filter(isNew);
    if (fresh.length === 0) continue;

    if (projectsWithBase(base).length > 0) {
      for (const f of fresh) {
        report.info.push(`${rel(f)} — a new file for existing project ${base}; the project was not changed.`);
        markSeen(f, "existing-project");
      }
      continue;
    }

    // Cancelled/draft files are never the job; distinct names under one
    // number (EVT26QT018-style) mean the number was reused — ask, don't pick.
    const usable = files.filter((f) => !/cancel|draft/i.test(path.basename(f)));
    const stems = new Set(
      usable.map((f) =>
        path.basename(f, ".pdf").toUpperCase()
          .replace(/^[A-Z]{2,4}\d{2}QT\d{3,4}([\s_-]*(R|REV)\.?\s*0*\d{1,2}(?![0-9]))?/, "")
          .replace(/[^A-Z0-9]/g, ""),
      ),
    );
    if (usable.length === 0) {
      files.forEach((f) => markSeen(f, "cancelled-or-draft"));
      continue;
    }
    if (stems.size > 1) {
      report.review.push(`Quotation ${base}: files with different names under one number (${usable.map((f) => path.basename(f)).join(" | ")}) — which is the real job?`);
      files.forEach((f) => markSeen(f, "ambiguous"));
      continue;
    }

    const newest = usable.sort((a, b) => revisionOf(b) - revisionOf(a))[0];
    try {
      const draft = await extractProjectFromPdf(readFileSync(newest).toString("base64"));
      const printed = draft.code ? parseCode(draft.code) : null;
      if (printed && printed.base !== base) {
        report.review.push(`${rel(newest)}: the file name says ${base} but the document says ${draft.code}.`);
        files.forEach((f) => markSeen(f, "code-mismatch"));
        continue;
      }
      const code = printed?.code ?? parseCode(path.basename(newest))!.code;
      if (DRY_RUN) {
        report.done.push(`[dry run] would create project ${code} — ${draft.name}`);
        continue;
      }
      const { rows: [{ id }] } = await db.query(
        `insert into tracker.projects
           (workspace_id, name, code, client_name, location, description, currency,
            quotation_date, status, priority, po_status, owner_id, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'planning','medium','waiting',$9,$9) returning id`,
        [WORKSPACE_ID, draft.name, code, draft.client_name, draft.location, draft.description,
         draft.currency, draft.quotation_date, OWNER_ID],
      );
      for (const line of draft.budget_lines) {
        await db.query(
          `insert into tracker.budget_lines (project_id, category, description, planned_amount, created_by)
           values ($1,$2,$3,$4,$5)`,
          [id, line.category, line.description, line.planned_amount, OWNER_ID],
        );
      }
      for (const [i, task] of draft.tasks.entries()) {
        await db.query(
          `insert into tracker.tasks (project_id, title, description, status, priority, kind, sort_order, created_by)
           values ($1,$2,$3,'todo','medium','task',$4,$5)`,
          [id, task.title, task.description, i, OWNER_ID],
        );
      }
      await log("project", id, "create", `Imported project "${draft.name}" from ${path.basename(newest)}`, draft);
      report.done.push(`New project ${code} — ${draft.name}`);
      files.forEach((f) => markSeen(f, `created ${code}`));
      created++;
    } catch (err) {
      stopIfAiUnavailable(err);
      report.review.push(`${rel(newest)}: couldn't read it (${(err as Error).message}).`);
    }
  }
  return created;
}

const normalizePo = (po: string | null | undefined) =>
  po ? po.toUpperCase().replace(/[^A-Z0-9]/g, "") || null : null;

/** "EVT26IV001-01" / "EVT26IV001R1" -> "EVT26IV001" */
const invoiceBase = (no: string) =>
  no.toUpperCase().replace(/(?:[\s_-]+|[\s_-]*(?:R|REV)\.?\s*-?)0*\d{1,2}$/, "");

function revisionOf(file: string): number {
  const m = path.basename(file).toUpperCase().match(/QT\d{3,4}[\s_-]*(?:R|REV)\.?\s*0*(\d{1,2})(?![0-9])/);
  return m ? Number(m[1]) : 0;
}

// ------------------------------------------------ project folders

interface ProjectFolder { dir: string; project: ProjectLite }

function projectFolders(): ProjectFolder[] {
  if (!existsSync(SOURCES.projects)) return [];
  const out: ProjectFolder[] = [];
  for (const entry of readdirSync(SOURCES.projects, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const parsed = parseCode(entry.name);
    const match = parsed ? resolveProject([parsed.code]) : null;
    if (match && "project" in match) out.push({ dir: path.join(SOURCES.projects, entry.name), project: match.project });
  }
  return out;
}

// ------------------------------------------------ job 3: photos

async function processPhotos(folder: ProjectFolder) {
  const photos = listFiles(path.join(folder.dir, "Photo"), true).filter(isNew);
  let uploaded = 0;
  for (const file of photos) {
    const ext = path.extname(file).toLowerCase();
    const mime = IMAGE_MIME[ext];
    const name = path.basename(file);
    if (!mime) {
      if ([".heic", ".heif"].includes(ext)) {
        report.review.push(`${rel(file)}: HEIC photos can't be uploaded (the app takes JPG, PNG, WebP, GIF) — save it as JPG.`);
      } else {
        report.info.push(`${rel(file)}: not a photo, left as is.`);
      }
      markSeen(file, "skipped");
      continue;
    }
    const { size } = fileState(file);
    if (size > MAX_UPLOAD_BYTES) {
      report.review.push(`${rel(file)}: over the 20MB upload limit.`);
      markSeen(file, "too-large");
      continue;
    }
    const { rows: dupes } = await db.query(
      `select 1 from tracker.documents where project_id = $1 and file_name = $2 and size_bytes = $3 limit 1`,
      [folder.project.id, name, size],
    );
    if (dupes.length) {
      markSeen(file, "already-uploaded");
      continue;
    }
    if (DRY_RUN) {
      report.done.push(`[dry run] would upload photo ${name} to ${folder.project.code}`);
      continue;
    }
    const storagePath = buildStoragePath(WORKSPACE_ID, folder.project.id, name);
    const { error } = await admin.storage.from(BUCKET).upload(storagePath, readFileSync(file), { contentType: mime });
    if (error) {
      report.review.push(`${rel(file)}: upload failed (${error.message}).`);
      continue;
    }
    // Same versioning as recordDocument: a re-upload of the same name
    // supersedes rather than overwrites.
    const { rows: [prev] } = await db.query(
      `select id, version from tracker.documents where project_id = $1 and file_name = $2
       order by version desc limit 1`,
      [folder.project.id, name],
    );
    await db.query(
      `insert into tracker.documents
         (workspace_id, project_id, file_name, storage_path, mime_type, size_bytes, category,
          description, version, replaces_id, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,'photo','Uploaded automatically from the PC Photo folder',$7,$8,$9)`,
      [WORKSPACE_ID, folder.project.id, name, storagePath, mime, size, (prev?.version ?? 0) + 1, prev?.id ?? null, OWNER_ID],
    );
    markSeen(file, "uploaded");
    uploaded++;
  }
  if (uploaded > 0) {
    await log("document", folder.project.id, "upload", `Uploaded ${uploaded} photo${uploaded === 1 ? "" : "s"} from the Photo folder`);
    report.done.push(`${folder.project.code}: uploaded ${uploaded} photo${uploaded === 1 ? "" : "s"}`);
  }
}

// ------------------------------------------------ jobs 2 & 4: documents

/**
 * Account-level AI failures (no credit, rejected key) will fail every file
 * the same way, so stop the run with one clear message instead of listing
 * each file. Files it didn't get to stay unseen and are retried next run.
 */
class AiUnavailable extends Error {}

function stopIfAiUnavailable(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (/credit balance is too low/i.test(message)) {
    throw new AiUnavailable(
      "the Anthropic account is out of API credit — top it up at console.anthropic.com (Plans & Billing).",
    );
  }
  if (/authentication_error|invalid x-api-key/i.test(message)) {
    throw new AiUnavailable("the Anthropic API key was rejected — check ANTHROPIC_API_KEY in .env.local.");
  }
}

type Source = "project-docs" | "customer-po" | "invoice" | "receipt";

async function processDocument(file: string, source: Source, folderProject?: ProjectLite, preread?: BusinessDocument) {
  let doc: BusinessDocument;
  try {
    doc = preread ?? (await readBusinessDocument(readFileSync(file).toString("base64")));
  } catch (err) {
    stopIfAiUnavailable(err);
    report.review.push(`${rel(file)}: couldn't read it (${(err as Error).message}).`);
    return;
  }

  const expected = source === "invoice" ? "invoice" : source === "receipt" ? "receipt" : null;
  if (expected && doc.doc_type !== expected) {
    report.review.push(`${rel(file)}: this is in the ${expected} folder but reads as ${doc.doc_type.replace("_", " ")}.`);
    markSeen(file, "wrong-type");
    return;
  }
  if (!["purchase_order", "invoice", "receipt"].includes(doc.doc_type)) {
    if (source === "customer-po") report.review.push(`${rel(file)}: not a purchase order (reads as ${doc.doc_type.replace("_", " ")}).`);
    else report.info.push(`${rel(file)}: ${doc.doc_type.replace("_", " ")}, left as is.`);
    markSeen(file, `ignored ${doc.doc_type}`);
    return;
  }

  // Which project: the folder it's in (checked against what it says), or
  // the quotation number printed on it.
  let project = folderProject;
  const byRef = doc.quotation_refs.length ? resolveProject(doc.quotation_refs) : null;
  if (project) {
    if (byRef && "project" in byRef && byRef.project.id !== project.id) {
      report.review.push(`${rel(file)}: it's in ${project.code}'s folder but refers to ${byRef.project.code}.`);
      markSeen(file, "project-mismatch");
      return;
    }
  } else if (byRef && "project" in byRef) {
    project = byRef.project;
  } else {
    // No usable quotation number: fall back to the customer's PO number,
    // but only on an exact match to one project's recorded PO.
    const po = normalizePo(doc.po_number);
    const byPo = po ? projects.filter((p) => normalizePo(p.po_number) === po) : [];
    if (byPo.length === 1) {
      project = byPo[0];
    } else {
      const why = byRef?.problem ?? "no quotation or PO number on it that matches a project";
      report.review.push(`${rel(file)}: ${why} — put a copy in the project's "Project Documents" folder to file it.`);
      markSeen(file, "unmatched");
      return;
    }
  }

  if (project.po_status === "lost") {
    report.review.push(`${rel(file)}: ${project.code} is marked LOST, but this ${doc.doc_type.replace("_", " ")} arrived — check it.`);
    markSeen(file, "project-lost");
    return;
  }

  if (doc.doc_type === "purchase_order") await applyPurchaseOrder(file, project, doc);
  else await applyPayment(file, project, doc);
}

async function applyPurchaseOrder(file: string, project: ProjectLite, doc: BusinessDocument) {
  const poNumber = doc.po_number ?? doc.document_number;
  if (project.po_status === "received" && (!poNumber || project.po_number === poNumber)) {
    report.info.push(`${rel(file)}: ${project.code} already marked PO received.`);
    markSeen(file, "already-received");
    return;
  }
  if (DRY_RUN) {
    report.done.push(`[dry run] would mark ${project.code} PO received${poNumber ? ` (PO ${poNumber})` : ""}`);
    return;
  }
  await db.query(
    `update tracker.projects set po_status = 'received',
       po_number = coalesce($2, po_number), po_date = coalesce($3::date, po_date)
     where id = $1`,
    [project.id, poNumber, doc.document_date],
  );
  await log("project", project.id, "update", `PO received${poNumber ? ` (PO ${poNumber})` : ""} from ${path.basename(file)}`, { po_number: poNumber, po_date: doc.document_date });
  project.po_status = "received";
  project.po_number = poNumber ?? project.po_number;
  report.done.push(`${project.code}: PO received${poNumber ? ` — PO ${poNumber}` : ""}`);
  markSeen(file, "po-received");
}

interface TermRow {
  id: string;
  label: string;
  amount: string;
  status: "pending" | "invoiced" | "paid";
  invoice_no: string | null;
  paid_on: string | null;
  sort_order: number;
}

async function applyPayment(file: string, project: ProjectLite, doc: BusinessDocument) {
  const isInvoice = doc.doc_type === "invoice";
  const amount = doc.subtotal_ex_vat;
  if (amount === null) {
    report.review.push(`${rel(file)}: couldn't find the amount before VAT.`);
    markSeen(file, "no-amount");
    return;
  }
  if (doc.currency && doc.currency !== project.currency) {
    report.review.push(`${rel(file)}: billed in ${doc.currency} but ${project.code} is in ${project.currency}.`);
    markSeen(file, "currency-mismatch");
    return;
  }

  const { rows: terms } = await db.query<TermRow>(
    `select id, label, amount::text, status, invoice_no, paid_on::text, sort_order
     from tracker.payment_terms where project_id = $1 order by sort_order, created_at`,
    [project.id],
  );
  const same = (t: TermRow) => Math.abs(Number(t.amount) - amount) < 1;
  const money = `${project.currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  if (isInvoice && doc.document_number && terms.some((t) => t.invoice_no === doc.document_number)) {
    markSeen(file, "already-recorded");
    return;
  }
  // A revised invoice (EVT26IV001 -> EVT26IV001-01) replaces the original;
  // recording both would count the same instalment twice.
  const revisionOfRecorded =
    isInvoice && doc.document_number
      ? terms.find((t) => t.invoice_no && t.invoice_no !== doc.document_number &&
          invoiceBase(t.invoice_no) === invoiceBase(doc.document_number!))
      : undefined;
  if (revisionOfRecorded) {
    report.review.push(`${rel(file)}: another version of invoice ${revisionOfRecorded.invoice_no}, already recorded on ${project.code} as "${revisionOfRecorded.label}" — if this one is the correct version, update that payment by hand.`);
    markSeen(file, "invoice-revision");
    return;
  }
  if (!isInvoice && terms.some((t) => t.status === "paid" && same(t) && t.paid_on === doc.document_date)) {
    markSeen(file, "already-recorded");
    return;
  }

  // Match an existing instalment by amount — for a receipt, prefer the one
  // already invoiced; otherwise the earliest open one.
  const open = terms.filter((t) => t.status !== "paid" && same(t) && (isInvoice ? !t.invoice_no : true));
  const target = isInvoice ? open[0] : (open.find((t) => t.status === "invoiced") ?? open[0]);
  const what = isInvoice ? `invoiced (${doc.document_number ?? "no number"})` : "paid";

  if (DRY_RUN) {
    report.done.push(`[dry run] ${project.code}: ${target ? `"${target.label}"` : "new payment term"} ${money} would be marked ${what}`);
    return;
  }

  if (target) {
    if (isInvoice) {
      await db.query(
        `update tracker.payment_terms set status = 'invoiced', invoice_no = $2,
           invoiced_on = coalesce($3::date, invoiced_on), due_date = coalesce($4::date, due_date)
         where id = $1`,
        [target.id, doc.document_number, doc.document_date, doc.due_date],
      );
    } else {
      await db.query(
        `update tracker.payment_terms set status = 'paid', paid_on = coalesce($2::date, paid_on) where id = $1`,
        [target.id, doc.document_date],
      );
    }
    await log("payment_term", target.id, "update", `Marked "${target.label}" ${what} from ${path.basename(file)}`);
    report.done.push(`${project.code}: "${target.label}" ${money} marked ${what}`);
  } else {
    const label = doc.installment_label ?? (isInvoice ? `Invoice ${doc.document_number ?? ""}`.trim() : "Payment received");
    const { rows: [{ next }] } = await db.query(
      `select coalesce(max(sort_order), -1) + 1 as next from tracker.payment_terms where project_id = $1`,
      [project.id],
    );
    const { rows: [{ id }] } = await db.query(
      `insert into tracker.payment_terms
         (project_id, label, percent, amount, due_date, status, invoice_no, invoiced_on, paid_on, sort_order, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [project.id, label.slice(0, 200), doc.percent, amount, doc.due_date,
       isInvoice ? "invoiced" : "paid",
       isInvoice ? doc.document_number : null,
       isInvoice ? doc.document_date : null,
       isInvoice ? null : doc.document_date,
       next, OWNER_ID],
    );
    await log("payment_term", id, "create", `Added "${label}" ${money} as ${what} from ${path.basename(file)}`);
    report.done.push(`${project.code}: added payment "${label}" ${money}, ${what}`);
  }

  // Being billed means the customer ordered.
  if (project.po_status === "waiting") {
    await db.query(`update tracker.projects set po_status = 'received' where id = $1`, [project.id]);
    await log("project", project.id, "update", `PO received (inferred from ${path.basename(file)})`);
    project.po_status = "received";
    report.done.push(`${project.code}: marked PO received (it's being billed)`);
  }
  markSeen(file, isInvoice ? "invoiced" : "paid");
}

// ------------------------------------------------------------------ main

/** Which job a file belongs to, from where it sits in the Drive. */
function sourceOf(file: string): { source: Source; folderProject?: ProjectLite } | null {
  const inside = (dir: string) => !path.relative(dir, file).startsWith("..");
  if (inside(SOURCES.customerPOs)) return { source: "customer-po" };
  if (inside(SOURCES.invoices)) return { source: "invoice" };
  if (inside(SOURCES.receipts)) return { source: "receipt" };
  const folder = projectFolders().find(({ dir }) => inside(path.join(dir, "Project Documents")));
  return folder ? { source: "project-docs", folderProject: folder.project } : null;
}

/**
 * --file <pdf> --doc <json>: record one document whose contents were read
 * outside this script (e.g. by Claude Code in a chat, so no API credit is
 * needed). The JSON is a BusinessDocument; every check below still applies.
 */
async function processPreread(file: string, docFile: string) {
  const where = sourceOf(file);
  if (!where) throw new Error(`${file} isn't in a watched folder (_Accounting or a project's Project Documents).`);
  const doc = JSON.parse(readFileSync(docFile, "utf8")) as BusinessDocument;
  await processDocument(file, where.source, where.folderProject, doc);
}

function allWatchedFiles(): string[] {
  const files = [
    ...listFiles(SOURCES.quotations).filter(isPdf),
    ...accountingPdfs(SOURCES.customerPOs),
    ...accountingPdfs(SOURCES.invoices),
    ...accountingPdfs(SOURCES.receipts),
  ];
  for (const { dir } of projectFolders()) {
    files.push(...listFiles(path.join(dir, "Photo"), true));
    files.push(...listFiles(path.join(dir, "Project Documents"), true).filter(isPdf));
  }
  return files;
}

async function runJobs() {
  const created = await processQuotations();
  if (created > 0) {
    await loadProjects();
    execSync("npm run folders", {
      cwd: ROOT,
      stdio: "ignore",
      env: { ...process.env, PROJECT_FOLDERS_ROOT: SOURCES.projects, PROJECT_FOLDERS_WORKSPACE: WORKSPACE_ID },
    });
    report.done.push(`Created PC folders for ${created} new project${created === 1 ? "" : "s"}`);
  }

  for (const folder of projectFolders()) {
    await processPhotos(folder);
    for (const f of listFiles(path.join(folder.dir, "Project Documents"), true).filter(isPdf).filter(isNew)) {
      await processDocument(f, "project-docs", folder.project);
    }
  }
  for (const f of accountingPdfs(SOURCES.customerPOs).filter(isNew)) await processDocument(f, "customer-po");
  for (const f of accountingPdfs(SOURCES.invoices).filter(isNew)) await processDocument(f, "invoice");
  for (const f of accountingPdfs(SOURCES.receipts).filter(isNew)) await processDocument(f, "receipt");
}

async function main() {
  if (existsSync(LOCK_FILE) && Date.now() - statSync(LOCK_FILE).mtimeMs < 50 * 60 * 1000) {
    console.log("Another inbox run is still going — skipping this one.");
    return;
  }
  if (!DRY_RUN) writeFileSync(LOCK_FILE, String(process.pid));

  db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await loadProjects();

    if (BASELINE) {
      const files = allWatchedFiles();
      for (const f of files) ledger[f] = { ...fileState(f), outcome: "baseline", at: new Date().toISOString() };
      console.log(`Baseline: marked ${files.length} existing files as already seen. Only files added from now on will be processed.`);
      return;
    }

    let stopped: string | null = null;
    try {
      if (PREREAD) await processPreread(path.resolve(PREREAD.file), PREREAD.doc);
      else await runJobs();
    } catch (err) {
      if (!(err instanceof AiUnavailable)) throw err;
      stopped = err.message;
    }

    const section = (title: string, lines: string[]) =>
      lines.length ? `\n${title} (${lines.length})\n${lines.map((l) => `  - ${l}`).join("\n")}` : "";
    const summary =
      (stopped
        ? `\nSTOPPED EARLY: ${stopped} Files not reached yet will be processed on the next run after that's fixed.`
        : "") +
      section("DONE", report.done) + section("NEEDS REVIEW", report.review) + section("NOTES", report.info);
    console.log(
      `${DRY_RUN ? "DRY RUN — nothing was changed.\n" : ""}Inbox run ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })}` +
        (summary || "\nNothing new."),
    );
  } finally {
    if (!DRY_RUN) {
      writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 1));
      if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
    }
    await db.end();
  }
}

main().catch((err) => {
  console.error("Inbox run failed:", err);
  if (!DRY_RUN && existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
  process.exit(1);
});
