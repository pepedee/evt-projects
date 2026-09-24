/** Display helpers. Everything here is pure and safe on both server and client. */

const LOCALE = "en-GB";

/**
 * Pinned rather than left to the runtime's ambient timezone. Without this,
 * toLocaleDateString/toLocaleString silently use whatever timezone the code
 * is currently running in — UTC on the Vercel server, the visitor's real
 * timezone in the browser — so a timestamp near a day boundary renders a
 * different calendar date server-side than client-side. React hydration
 * then sees mismatched text and fails outright in production (caught live:
 * "Recent activity" and "Files" timestamps triggered a hydration error on
 * every page load). The business is Thailand-based, so this is also just
 * the correct timezone to show dates in regardless of who's viewing.
 */
const TIME_ZONE = "Asia/Bangkok";

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

/**
 * Money always carries its currency — a project owns one, and everything
 * under it inherits, so there is never a figure without a known unit.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency = "THB",
): string {
  const n = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

/** Y/M/D of "now" in TIME_ZONE, so "today" means the same calendar day on
 * the server and in the browser regardless of either one's system clock
 * timezone — the same hydration-mismatch risk formatDate/formatDateTime
 * have, since `new Date().getFullYear()`-style getters read local time. */
function todayInTimeZone(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Today's date as "YYYY-MM-DD" in TIME_ZONE — for anything that needs to
 * compare against `date`-typed columns (which have no timezone of their own)
 * the same way formatRelativeDays already does, rather than a fresh
 * ad hoc computation with its own hydration risk. */
export function todayISO(): string {
  const t = todayInTimeZone();
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}

/** "in 3 days", "2 days ago" — for due dates, which are the whole point. */
export function formatRelativeDays(date: string | null | undefined): string {
  if (!date) return "—";
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return "—";

  const today = todayInTimeZone();
  const todayUtcMs = Date.UTC(today.year, today.month - 1, today.day);
  const targetUtcMs = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
  );
  const days = Math.round((targetUtcMs - todayUtcMs) / 86_400_000);

  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days overdue`;
}
