/**
 * Date formatting for values that came out of MariaDB.
 *
 * Two things make this less trivial than it looks:
 *
 * 1. The driver returns `'YYYY-MM-DD HH:MM:SS'` with no zone marker. The pool
 *    is configured for UTC, so the value is UTC and must be labelled as such —
 *    `new Date("2026-09-25 20:00:00")` would be read as *local* time instead.
 * 2. These strings are rendered during SSR and again on the client. Formatting
 *    in the viewer's local zone would produce two different strings and trip a
 *    hydration mismatch, so a fixed zone is used on both sides.
 */

/** The audience is a Chinese festival card, so times read in Beijing time. */
const TIME_ZONE = "Asia/Shanghai";

function parseUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ),
  );
}

function parts(date: Date): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) out[part.type] = part.value;
  return out;
}

/** `2026.09.25` — falls back to the raw value if it is not a known shape. */
export function formatDate(value: string): string {
  const date = parseUtc(value);
  if (!date) return value;
  const p = parts(date);
  return `${p.year}.${p.month}.${p.day}`;
}

/** `2026.09.25 20:31` */
export function formatDateTime(value: string): string {
  const date = parseUtc(value);
  if (!date) return value;
  const p = parts(date);
  // Intl renders midnight as hour "24" in some ICU versions; normalise it.
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${p.year}.${p.month}.${p.day} ${hour}:${p.minute}`;
}
