/**
 * The tracker as a set of tools for Claude (an MCP server over stdio).
 *
 * Registered with Claude Code / Claude Desktop so the owner can ask, in plain
 * words, "who owes us money?" or "record this receipt" and Claude calls these
 * tools instead of writing a one-off script each time.
 *
 *   node node_modules/tsx/dist/cli.mjs --env-file=.env.local scripts/mcp-server.ts
 *
 * Not `npm run`: npm prints a banner to stdout, and stdout is the protocol.
 *
 * Ground rules (same spirit as the inbox):
 *   - reads are free; every write is two calls — `confirm: false` returns a
 *     preview, `confirm: true` (after the owner says OK) writes it;
 *   - billing documents go through the inbox's own tested rules
 *     (`scripts/inbox.ts --file --doc`), not a second copy of them;
 *   - every write lands in the activity log as "Agent: …";
 *   - amounts are before VAT, in the project's own currency.
 *
 * Talks to the real workspace with the service connection, so test changes
 * against a throwaway account via INBOX_WORKSPACE / INBOX_OWNER (the same
 * overrides the inbox uses — and they carry through to it).
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import pg from "pg";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// "pepe's workspace" and its owner (bozosx@gmail.com) — see TASKS.md phase 37.
const WORKSPACE_ID = process.env.INBOX_WORKSPACE ?? "865dc9b6-c93d-45f5-aef6-03af8be689fc";
const OWNER_ID = process.env.INBOX_OWNER ?? "bdf6c953-ee2d-43cc-9e54-f0a4d26581db";
const ROOT = path.resolve(__dirname, "..");
const APP_URL = "https://evt-projects.vercel.app";

const db = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 3 });
const TODAY = `(now() at time zone 'Asia/Bangkok')::date`;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

class UserError extends Error {}

// ------------------------------------------------------------------ helpers

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  client_name: string | null;
  currency: string;
  status: string;
  po_status: string;
  po_number: string | null;
  po_date: string | null;
}

/** Exact code first, then a unique code that starts with it (EVT26QT002 → EVT26QT002R1 only if unambiguous). */
async function resolveProject(code: string): Promise<ProjectRow> {
  const { rows } = await db.query<ProjectRow>(
    `select id, code, name, client_name, currency, status, po_status, po_number, po_date::text
     from tracker.projects
     where workspace_id = $1 and deleted_at is null and (upper(code) = upper($2) or upper(code) like upper($2) || '%')
     order by length(code)`,
    [WORKSPACE_ID, code.trim()],
  );
  const exact = rows.find((r) => r.code.toUpperCase() === code.trim().toUpperCase());
  if (exact) return exact;
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new UserError(`No project with code "${code}". Use find_projects to search by name or client.`);
  throw new UserError(`"${code}" matches several projects: ${rows.map((r) => r.code).join(", ")}. Use the full code.`);
}

async function money(projectId: string) {
  const { rows: [m] } = await db.query(
    `select o.planned_total as contract,
       (select sum(amount) from tracker.payment_terms t where t.project_id = o.id and t.status <> 'pending') as billed,
       (select sum(amount) from tracker.payment_terms t where t.project_id = o.id and t.status = 'paid') as paid,
       (select sum(amount) from tracker.payment_terms t where t.project_id = o.id and t.status <> 'paid'
          and t.due_date < ${TODAY}) as overdue,
       (select sum(amount) from tracker.expenses e where e.project_id = o.id) as costs
       ,(select sum(amount) from tracker.payment_terms t where t.project_id = o.id) as instalments
     from tracker.project_overview o where o.id = $1`,
    [projectId],
  );
  const billed = num(m.billed), paid = num(m.paid), costs = num(m.costs);
  // Contract value comes from the quoted budget lines; a project imported
  // without them would otherwise read as a 0 contract and a negative margin.
  const fromBudget = num(m.contract) > 0;
  const contract = fromBudget ? num(m.contract) : num(m.instalments);
  return {
    contract_value: contract,
    contract_value_basis: fromBudget ? "quoted budget lines" : contract > 0 ? "payment instalments (no budget lines on this project)" : "unknown (no budget lines or instalments)",
    billed,
    paid,
    outstanding_billed: round2(billed - paid),
    overdue: num(m.overdue),
    not_yet_billed: round2(Math.max(contract - billed, 0)),
    costs_recorded: costs,
    gross_margin: round2(contract - costs),
    gross_margin_pct: contract > 0 ? Math.round(((contract - costs) / contract) * 1000) / 10 : null,
  };
}

async function log(entity: string, entityId: string, action: string, summary: string, after?: unknown) {
  await db.query(
    `insert into tracker.activity_logs (workspace_id, actor_id, entity, entity_id, action, summary, after)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [WORKSPACE_ID, OWNER_ID, entity, entityId, action, `Agent: ${summary}`, after ? JSON.stringify(after) : null],
  );
}

/** "EVT26PO010R1" / "EVT26PO018_Rev01" → "EVT26PO010" / "EVT26PO018", so a revision isn't recorded twice. */
const refBase = (ref: string) => ref.trim().toUpperCase().replace(/[\s_.-]*(?:R|REV)\.?\s*-?0*\d{1,2}$/, "");

const PREVIEW_NOTE = "Nothing was written. Show this to the owner; only after they agree, call again with confirm: true.";

// ------------------------------------------------------------------ tools

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const;
const PO_STATUSES = ["waiting", "received", "lost"] as const;

const schemas = {
  find_projects: z.object({
    search: z.string().optional().describe("Words to look for in the code, name, client or location, e.g. 'Silathong' or 'QT045'."),
    status: z.enum(STATUSES).optional(),
    po_status: z.enum(PO_STATUSES).optional().describe("waiting = no customer PO yet, received = won, lost."),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  get_project: z.object({
    project_code: z.string().describe("Quotation number, e.g. EVT26QT002R1."),
  }),
  list_receivables: z.object({
    overdue_only: z.boolean().optional().describe("Only instalments past their due date."),
  }),
  business_summary: z.object({}),
  add_expense: z.object({
    project_code: z.string(),
    description: z.string().min(1).max(250).describe("What was bought or paid for, e.g. 'Brentwood TX19MA fill, 4,840 sheets'."),
    amount: z.number().positive().describe("Before VAT. For a PO with withholding tax, the subtotal before WHT."),
    currency: z.string().length(3).describe("Must be the project's currency (THB or USD)."),
    incurred_on: date.describe("The PO / bill date."),
    vendor: z.string().max(200).optional(),
    reference: z.string().max(60).optional().describe("Supplier PO or bill number, e.g. EVT26PO020. Used to refuse duplicates (revisions included)."),
    confirm: z.boolean().optional(),
  }),
  record_billing_document: z.object({
    file_path: z.string().describe("Full path of the PDF. It must sit in _Accounting (Invoices / Receipts / PO from Customer) or in a project's 'Project Documents' folder."),
    doc_type: z.enum(["invoice", "receipt", "purchase_order"]).describe("purchase_order = a CUSTOMER's order to Evertech."),
    document_number: z.string().nullable(),
    document_date: date.nullable(),
    quotation_refs: z.array(z.string()).describe("Evertech quotation numbers printed on it (or known from its invoice), e.g. ['EVT26QT002R1']."),
    po_number: z.string().nullable().optional().describe("The customer's PO number."),
    customer_name: z.string().nullable().optional(),
    currency: z.string().nullable().optional(),
    subtotal_ex_vat: z.number().nullable().optional(),
    installment_label: z.string().nullable().optional().describe("e.g. '2nd installment 50% - NET 30 days after commissioning'."),
    percent: z.number().nullable().optional(),
    due_date: date.nullable().optional(),
    confirm: z.boolean().optional(),
  }),
  set_project_po: z.object({
    project_code: z.string(),
    po_status: z.enum(PO_STATUSES),
    po_number: z.string().max(60).optional(),
    po_date: date.optional(),
    confirm: z.boolean().optional(),
  }),
};

type Args<K extends keyof typeof schemas> = z.infer<(typeof schemas)[K]>;

const descriptions: Record<keyof typeof schemas, string> = {
  find_projects:
    "Search Evertech's projects (one per quotation). Returns code, name, client, status, customer-PO status, contract value, billed/paid, costs recorded and margin.",
  get_project:
    "Everything about one project: details, payment instalments, recorded costs (expenses), quoted budget lines, overdue tasks, and a money summary (contract, billed, paid, outstanding, overdue, costs, gross margin).",
  list_receivables:
    "Money customers owe: every unpaid payment instalment that has been invoiced or has a due date, oldest due first, with days overdue.",
  business_summary:
    "One-page snapshot per currency: projects by status and customer-PO status, won contract value, outstanding and overdue receivables, costs recorded, and the oldest overdue invoices.",
  add_expense:
    "Record a cost against a project (supplier PO, labour, materials). Two steps: confirm=false returns a preview and writes nothing; call again with confirm=true only after the owner agrees. Refuses duplicates by reference.",
  record_billing_document:
    "File an Evertech invoice or receipt, or a customer's PO, that you have read: marks the matching payment instalment invoiced/paid (or adds one), or marks the project PO received. Runs the inbox's own rules, so matching, duplicate and currency checks are the same as the hourly job. Two steps: confirm=false is a dry run; confirm=true after the owner agrees.",
  set_project_po:
    "Set a project's customer-PO status (waiting / received / lost) and optionally the PO number and date. Two steps: confirm=false previews, confirm=true writes after the owner agrees.",
};

const READ_ONLY = new Set(["find_projects", "get_project", "list_receivables", "business_summary"]);

// ---------------------------------------------------------- read handlers

async function findProjects(a: Args<"find_projects">) {
  const like = a.search ? `%${a.search.trim()}%` : null;
  const { rows } = await db.query(
    `select o.code, o.name, o.client_name, o.location, o.status, o.po_status, o.po_number, o.currency,
       o.planned_total::float as contract_value, o.target_date::text, o.progress_pct,
       coalesce((select sum(amount) from tracker.payment_terms t where t.project_id = o.id and t.status <> 'pending'), 0)::float as billed,
       coalesce((select sum(amount) from tracker.payment_terms t where t.project_id = o.id and t.status = 'paid'), 0)::float as paid,
       coalesce((select sum(amount) from tracker.expenses e where e.project_id = o.id), 0)::float as costs_recorded
     from tracker.project_overview o
     where o.workspace_id = $1 and o.deleted_at is null
       and ($2::text is null or o.code ilike $2 or o.name ilike $2 or o.client_name ilike $2 or o.location ilike $2)
       and ($3::text is null or o.status = $3)
       and ($4::text is null or o.po_status = $4)
     order by o.code
     limit $5`,
    [WORKSPACE_ID, like, a.status ?? null, a.po_status ?? null, a.limit ?? 60],
  );
  return { count: rows.length, projects: rows };
}

async function getProject(a: Args<"get_project">) {
  const p = await resolveProject(a.project_code);
  const [{ rows: [detail] }, { rows: payments }, { rows: expenses }, { rows: budget }, { rows: overdueTasks }] = await Promise.all([
    db.query(
      `select code, name, client_name, location, description, status, priority, po_status, po_number, po_date::text,
         quotation_date::text, start_date::text, target_date::text, currency, progress_pct,
         task_total::int, task_done::int, task_overdue::int
       from tracker.project_overview where id = $1`,
      [p.id],
    ),
    db.query(
      `select label, percent::float, amount::float, status, invoice_no, invoiced_on::text, due_date::text, paid_on::text
       from tracker.payment_terms where project_id = $1 order by sort_order, created_at`,
      [p.id],
    ),
    db.query(
      `select incurred_on::text, vendor, description, amount::float from tracker.expenses where project_id = $1 order by incurred_on`,
      [p.id],
    ),
    db.query(
      `select category, description, planned_amount::float as amount from tracker.budget_lines where project_id = $1 order by sort_order`,
      [p.id],
    ),
    db.query(
      `select title, status, due_date::text from tracker.tasks
       where project_id = $1 and deleted_at is null and status not in ('done', 'cancelled') and due_date < ${TODAY}
       order by due_date limit 10`,
      [p.id],
    ),
  ]);
  return {
    ...detail,
    link: `${APP_URL}/projects/${p.id}`,
    money: await money(p.id),
    payment_instalments: payments,
    expenses,
    quoted_budget_lines: budget,
    overdue_tasks: overdueTasks,
  };
}

async function listReceivables(a: Args<"list_receivables">) {
  const { rows } = await db.query(
    `select p.code, p.name, p.client_name, p.currency, t.label, t.amount::float, t.status, t.invoice_no,
       t.invoiced_on::text, t.due_date::text,
       case when t.due_date < ${TODAY} then ${TODAY} - t.due_date else 0 end as days_overdue
     from tracker.payment_terms t join tracker.projects p on p.id = t.project_id
     where t.workspace_id = $1 and p.deleted_at is null and t.status <> 'paid'
       and (t.status = 'invoiced' or t.due_date is not null)
       and (not $2 or t.due_date < ${TODAY})
     order by t.due_date nulls last, p.code`,
    [WORKSPACE_ID, a.overdue_only ?? false],
  );
  const totals: Record<string, { outstanding: number; overdue: number }> = {};
  for (const r of rows) {
    const t = (totals[r.currency] ??= { outstanding: 0, overdue: 0 });
    t.outstanding = round2(t.outstanding + r.amount);
    if (r.days_overdue > 0) t.overdue = round2(t.overdue + r.amount);
  }
  return { note: "Amounts before VAT.", totals_by_currency: totals, instalments: rows };
}

async function businessSummary() {
  const { rows: byStatus } = await db.query(
    `select currency, status, po_status, count(*)::int as projects, sum(planned_total)::float as contract_value
     from tracker.project_overview where workspace_id = $1 and deleted_at is null
     group by currency, status, po_status order by currency, status, po_status`,
    [WORKSPACE_ID],
  );
  const { rows: money } = await db.query(
    `select p.currency,
       sum(t.amount) filter (where t.status = 'invoiced')::float as invoiced_unpaid,
       sum(t.amount) filter (where t.status <> 'paid' and t.due_date < ${TODAY})::float as overdue,
       sum(t.amount) filter (where t.status = 'paid' and t.paid_on >= date_trunc('year', ${TODAY}))::float as received_this_year
     from tracker.payment_terms t join tracker.projects p on p.id = t.project_id
     where t.workspace_id = $1 and p.deleted_at is null group by p.currency`,
    [WORKSPACE_ID],
  );
  const { rows: costs } = await db.query(
    `select p.currency, sum(e.amount)::float as costs_recorded, count(distinct p.id)::int as projects_with_costs
     from tracker.expenses e join tracker.projects p on p.id = e.project_id
     where e.workspace_id = $1 and p.deleted_at is null group by p.currency`,
    [WORKSPACE_ID],
  );
  const { instalments } = await listReceivables({ overdue_only: true });
  return {
    note: "Amounts before VAT. 'Won' = customer PO received.",
    projects: byStatus,
    receivables: money,
    costs,
    oldest_overdue: instalments.slice(0, 5),
  };
}

// --------------------------------------------------------- write handlers

async function addExpense(a: Args<"add_expense">) {
  const p = await resolveProject(a.project_code);
  if (a.currency.toUpperCase() !== p.currency) {
    throw new UserError(`${p.code} is tracked in ${p.currency}, but this cost is in ${a.currency.toUpperCase()}. Ask the owner for the exchange rate and pass the converted amount in ${p.currency}.`);
  }
  if (a.reference) {
    const { rows } = await db.query(
      `select p.code, e.description, e.amount::float from tracker.expenses e join tracker.projects p on p.id = e.project_id
       where e.workspace_id = $1 and upper(e.description) like '%' || $2 || '%'`,
      [WORKSPACE_ID, refBase(a.reference)],
    );
    if (rows.length) {
      throw new UserError(`${a.reference} looks already recorded: ${rows.map((r) => `${r.code} "${r.description}" ${r.amount}`).join("; ")}. Not adding it again.`);
    }
  } else {
    const { rowCount } = await db.query(
      `select 1 from tracker.expenses where project_id = $1 and amount = $2 and incurred_on = $3`,
      [p.id, a.amount, a.incurred_on],
    );
    if (rowCount) throw new UserError(`${p.code} already has a cost of ${a.amount} on ${a.incurred_on}. Pass a reference if this is a different one.`);
  }

  const description = (a.reference && !a.description.toUpperCase().includes(refBase(a.reference))
    ? `${a.reference}: ${a.description}`
    : a.description).slice(0, 300);
  const before = await money(p.id);
  const row = { project: `${p.code} ${p.name}`, description, vendor: a.vendor ?? null, amount: a.amount, currency: p.currency, incurred_on: a.incurred_on };

  if (!a.confirm) {
    return {
      preview: "add expense",
      ...row,
      costs_after: round2(before.costs_recorded + a.amount),
      gross_margin_after: round2(before.contract_value - before.costs_recorded - a.amount),
      note: PREVIEW_NOTE,
    };
  }

  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into tracker.expenses (project_id, description, amount, incurred_on, vendor, created_by) values ($1,$2,$3,$4,$5,$6)`,
      [p.id, description, a.amount, a.incurred_on, a.vendor ?? null, OWNER_ID],
    );
    await client.query(
      `insert into tracker.activity_logs (workspace_id, actor_id, entity, entity_id, action, summary, after)
       values ($1, $2, 'expense', $3, 'create', $4, $5)`,
      [WORKSPACE_ID, OWNER_ID, p.id, `Agent: Recorded expense "${description}"`, JSON.stringify(row)],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  return { recorded: row, money_now: await money(p.id), link: `${APP_URL}/projects/${p.id}` };
}

const execFileP = promisify(execFile);

async function recordBillingDocument(a: Args<"record_billing_document">) {
  if (!existsSync(a.file_path)) throw new UserError(`File not found: ${a.file_path}`);
  const { confirm, file_path, ...doc } = a;
  const full = {
    po_number: null, customer_name: null, currency: null, subtotal_ex_vat: null,
    installment_label: null, percent: null, due_date: null,
    ...doc,
  };
  const dir = mkdtempSync(path.join(os.tmpdir(), "evt-doc-"));
  const docFile = path.join(dir, "doc.json");
  writeFileSync(docFile, JSON.stringify(full));
  try {
    const args = [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), path.join(ROOT, "scripts/inbox.ts"), "--file", file_path, "--doc", docFile];
    if (!confirm) args.push("--dry-run");
    // The inbox inherits this process's environment (database URL and any
    // INBOX_* test overrides), so it targets the same workspace.
    const { stdout, stderr } = await execFileP(process.execPath, args, { cwd: ROOT, timeout: 120_000, maxBuffer: 4 << 20 });
    const out = (stdout + (stderr ? `\n${stderr}` : "")).trim();
    return confirm ? out : `${out}\n\n${PREVIEW_NOTE}`;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    throw new UserError(`The inbox refused or failed:\n${[e.stdout, e.stderr].filter(Boolean).join("\n") || e.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function setProjectPo(a: Args<"set_project_po">) {
  const p = await resolveProject(a.project_code);
  const after = {
    po_status: a.po_status,
    po_number: a.po_number ?? p.po_number,
    po_date: a.po_date ?? p.po_date,
  };
  const before = { po_status: p.po_status, po_number: p.po_number, po_date: p.po_date };
  if (JSON.stringify(before) === JSON.stringify(after)) return `${p.code} already has exactly these PO details — nothing to change.`;
  if (!a.confirm) return { preview: `customer PO for ${p.code} ${p.name}`, before, after, note: PREVIEW_NOTE };

  await db.query(`update tracker.projects set po_status = $2, po_number = $3, po_date = $4 where id = $1`, [p.id, after.po_status, after.po_number, after.po_date]);
  await log("project", p.id, "update", `Customer PO set to ${after.po_status}${after.po_number ? ` (PO ${after.po_number})` : ""}`, after);
  return { updated: p.code, before, after, link: `${APP_URL}/projects/${p.id}` };
}

const handlers: { [K in keyof typeof schemas]: (a: Args<K>) => Promise<unknown> } = {
  find_projects: findProjects,
  get_project: getProject,
  list_receivables: listReceivables,
  business_summary: businessSummary,
  add_expense: addExpense,
  record_billing_document: recordBillingDocument,
  set_project_po: setProjectPo,
};

// ------------------------------------------------------------------ server

const server = new Server(
  { name: "evertech-tracker", version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "Tools for Evertech Cooling's project tracker (evt-projects.vercel.app) — the owner's real business data. " +
      "A project = one quotation (code like EVT26QT045R01). Money is before VAT, in the project's own currency. " +
      "Read tools are safe to call freely. Write tools (add_expense, record_billing_document, set_project_po) must first be called with confirm=false; " +
      "show the owner the preview, and call again with confirm=true only after they clearly agree. Never guess a project for a document — if the match is uncertain, ask. " +
      "The owner often writes in Thai; answer in the language they use.",
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: (Object.keys(schemas) as (keyof typeof schemas)[]).map((name) => {
    const inputSchema = z.toJSONSchema(schemas[name]) as Record<string, unknown>;
    delete inputSchema.$schema;
    return {
      name,
      description: descriptions[name],
      inputSchema: inputSchema as { type: "object" },
      annotations: READ_ONLY.has(name)
        ? { readOnlyHint: true, openWorldHint: false }
        : { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    };
  }),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name as keyof typeof schemas;
  if (!(name in schemas)) return { isError: true, content: [{ type: "text", text: `Unknown tool ${name}` }] };
  const parsed = schemas[name].safeParse(req.params.arguments ?? {});
  if (!parsed.success) {
    return { isError: true, content: [{ type: "text", text: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }] };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (handlers[name] as (a: any) => Promise<unknown>)(parsed.data);
    return { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 1) }] };
  } catch (err) {
    if (err instanceof UserError) return { isError: true, content: [{ type: "text", text: err.message }] };
    console.error(`[evertech-tracker] ${name} failed:`, err);
    return { isError: true, content: [{ type: "text", text: `Failed: ${(err as Error).message}` }] };
  }
});

async function main() {
  if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is not set — start with --env-file=.env.local");
  await server.connect(new StdioServerTransport());
  console.error(`[evertech-tracker] ready (workspace ${WORKSPACE_ID})`);
}

main().catch((err) => {
  console.error("[evertech-tracker] failed to start:", err);
  process.exit(1);
});
