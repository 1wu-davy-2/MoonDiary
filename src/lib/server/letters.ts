import { randomBytes } from "node:crypto";
import { execute, query } from "@/lib/db";
import type { Tone } from "@/lib/blessings";

/**
 * Letter persistence. Server-only — every export here touches the database.
 *
 * The public side of the app only ever sees `PublicLetter`, which deliberately
 * omits the creator's IP and user agent. Those live on `AdminLetterRow` and are
 * only reachable from the admin routes.
 */

/** Share-code alphabet: no 0/O/1/l/I, so a code read off a screen is unambiguous. */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const ID_LENGTH = 8;
const MAX_ID_ATTEMPTS = 5;

/**
 * Repeat opens from one address inside this window are not counted again, so a
 * refresh (or a link-preview fetch) does not inflate the view count.
 */
const VIEW_DEDUPE_MINUTES = 30;

export type PublicLetter = {
  id: string;
  to: string;
  from: string;
  tone: Tone;
  message: string;
  /** `YYYY-MM-DD HH:MM:SS` in UTC — see the `dateStrings` note in `@/lib/db`. */
  createdAt: string;
  views: number;
};

export type AdminLetterRow = PublicLetter & {
  createdIp: string;
  createdUa: string | null;
};

export type LetterViewRow = {
  id: number;
  ip: string;
  userAgent: string | null;
  referer: string | null;
  createdAt: string;
};

export type CreateLetterInput = {
  to: string;
  from: string;
  tone: Tone;
  message: string;
};

export type RequestMeta = {
  ip: string;
  userAgent: string | null;
  referer: string | null;
};

type LetterRow = {
  id: string;
  to_name: string;
  from_name: string;
  tone: string;
  message: string;
  views: number;
  created_at: string;
};

type AdminLetterDbRow = LetterRow & {
  created_ip: string;
  created_ua: string | null;
};

/**
 * A random share code, drawn without modulo bias.
 *
 * `randomBytes` returns 0–255, and 256 is not a multiple of the 31-character
 * alphabet, so bytes at or above the largest multiple of 31 are discarded
 * rather than folded in — folding would make the first few characters of every
 * code measurably more likely.
 */
function newId(): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let id = "";
  while (id.length < ID_LENGTH) {
    for (const byte of randomBytes(ID_LENGTH * 2)) {
      if (byte >= limit) continue;
      id += ALPHABET[byte % ALPHABET.length];
      if (id.length === ID_LENGTH) break;
    }
  }
  return id;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "ER_DUP_ENTRY"
  );
}

/**
 * Persist a letter and return its share code.
 *
 * A collision is astronomically unlikely (31^8 ≈ 8.5×10^11) but not impossible,
 * and the primary key is the only thing standing between two people and each
 * other's letter — so a clash retries with a fresh code rather than failing.
 */
export async function createLetter(
  input: CreateLetterInput,
  meta: RequestMeta,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    const id = newId();
    try {
      await execute(
        `INSERT INTO letters (id, to_name, from_name, tone, message, created_ip, created_ua)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, input.to, input.from, input.tone, input.message, meta.ip, meta.userAgent],
      );
      return id;
    } catch (error) {
      if (isDuplicateKey(error)) continue;
      throw error;
    }
  }
  throw new Error("无法生成唯一的分享码，请重试");
}

function toPublicLetter(row: LetterRow): PublicLetter {
  return {
    id: row.id,
    to: row.to_name,
    from: row.from_name,
    tone: row.tone as Tone,
    message: row.message,
    createdAt: row.created_at,
    views: Number(row.views),
  };
}

const PUBLIC_COLUMNS = "id, to_name, from_name, tone, message, views, created_at";

/** The letter as a recipient sees it — no creator IP, no user agent. */
export async function getLetter(id: string): Promise<PublicLetter | null> {
  const rows = await query<LetterRow>(
    `SELECT ${PUBLIC_COLUMNS} FROM letters WHERE id = ? LIMIT 1`,
    [id],
  );
  const row = rows[0];
  return row ? toPublicLetter(row) : null;
}

/**
 * Log one open. Returns whether it counted.
 *
 * Deliberately two statements rather than a single `INSERT ... SELECT ... WHERE
 * NOT EXISTS`: MySQL rejects a subquery that reads the table being inserted
 * into (error 1093), and the derived-table workaround is harder to read than
 * this. The window check and the insert are not atomic, so two requests landing
 * in the same instant can both count — acceptable for a view tally, and the
 * alternative is a unique key that a sliding window cannot express.
 */
export async function recordView(id: string, meta: RequestMeta): Promise<boolean> {
  const recent = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM letter_views
      WHERE letter_id = ? AND ip = ?
        AND created_at > (NOW() - INTERVAL ${VIEW_DEDUPE_MINUTES} MINUTE)`,
    [id, meta.ip],
  );
  if (Number(recent[0]?.n ?? 0) > 0) return false;

  await execute(
    `INSERT INTO letter_views (letter_id, ip, user_agent, referer) VALUES (?, ?, ?, ?)`,
    [id, meta.ip, meta.userAgent, meta.referer],
  );
  await execute(`UPDATE letters SET views = views + 1 WHERE id = ?`, [id]);
  return true;
}

/* ---------------------------------------------------------------- admin --- */

export type AdminLetterDetail = AdminLetterRow & { viewRows: LetterViewRow[] };

export async function getLetterForAdmin(id: string): Promise<AdminLetterDetail | null> {
  const rows = await query<AdminLetterDbRow>(
    `SELECT ${PUBLIC_COLUMNS}, created_ip, created_ua FROM letters WHERE id = ? LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const viewRows = await query<{
    id: number;
    ip: string;
    user_agent: string | null;
    referer: string | null;
    created_at: string;
  }>(
    `SELECT id, ip, user_agent, referer, created_at
       FROM letter_views WHERE letter_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 200`,
    [id],
  );

  return {
    ...toPublicLetter(row),
    createdIp: row.created_ip,
    createdUa: row.created_ua,
    viewRows: viewRows.map((v) => ({
      id: Number(v.id),
      ip: v.ip,
      userAgent: v.user_agent,
      referer: v.referer,
      createdAt: v.created_at,
    })),
  };
}

export type AdminListParams = {
  page: number;
  pageSize: number;
  /** Matched against the share code and the recipient name. */
  search?: string;
};

export type AdminListResult = {
  rows: AdminLetterRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listLettersForAdmin({
  page,
  pageSize,
  search,
}: AdminListParams): Promise<AdminListResult> {
  const term = search?.trim();
  const where = term ? "WHERE id LIKE ? OR to_name LIKE ?" : "";
  // Escape LIKE wildcards so a literal % or _ in the search box does not turn
  // into a match-everything pattern.
  const like = term ? `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : "";
  const filterParams = term ? [like, like] : [];

  const counted = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM letters ${where}`,
    filterParams,
  );
  const total = Number(counted[0]?.n ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);

  const rows = await query<AdminLetterDbRow>(
    `SELECT ${PUBLIC_COLUMNS}, created_ip, created_ua FROM letters ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...filterParams, pageSize, (safePage - 1) * pageSize],
  );

  return {
    rows: rows.map((row) => ({
      ...toPublicLetter(row),
      createdIp: row.created_ip,
      createdUa: row.created_ua,
    })),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

export type AdminStats = {
  letterCount: number;
  viewCount: number;
  todayCount: number;
  uniqueVisitors: number;
};

export async function getAdminStats(): Promise<AdminStats> {
  const rows = await query<{
    letter_count: number;
    view_count: number;
    today_count: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM letters) AS letter_count,
       (SELECT COUNT(*) FROM letter_views) AS view_count,
       (SELECT COUNT(*) FROM letters WHERE created_at >= CURDATE()) AS today_count`,
  );
  // COUNT(DISTINCT ip) over the whole table; the visitor log is small enough
  // that a covering index scan is cheaper than maintaining a separate table.
  const visitors = await query<{ n: number }>(
    `SELECT COUNT(DISTINCT ip) AS n FROM letter_views`,
  );

  const row = rows[0];
  return {
    letterCount: Number(row?.letter_count ?? 0),
    viewCount: Number(row?.view_count ?? 0),
    todayCount: Number(row?.today_count ?? 0),
    uniqueVisitors: Number(visitors[0]?.n ?? 0),
  };
}
