import { EMPTY_LETTER, type Letter, type Tone } from "@/lib/blessings";

/**
 * Browser-side storage.
 *
 * The app has no accounts, so the browser is the only thing that can answer
 * "what did I write" and "what did I already open". Content always has the
 * server as its source of truth — these caches only save a round trip and let
 * the sender find their own links again.
 *
 * Every read is guarded: `localStorage` throws in Safari private mode and when
 * a quota is exhausted, and a greeting card is not worth crashing over.
 */

const DRAFT_KEY = "yuejian-letter";
const MINE_KEY = "yuejian-mine";
const OPENED_KEY = "yuejian-opened";

/** How many entries each list keeps before the oldest is dropped. */
const MINE_LIMIT = 50;
const OPENED_LIMIT = 30;

export type CreatedLetter = {
  id: string;
  to: string;
  from: string;
  url: string;
  createdAt: string;
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota — the app works without the cache */
  }
}

/* ----------------------------------------------------------- the draft --- */

/** Restore the in-progress letter, clamped to the field limits. */
export function loadDraft(): Letter {
  const parsed = read<Partial<Letter>>(DRAFT_KEY, {});
  return {
    ...EMPTY_LETTER,
    ...parsed,
    to: String(parsed.to ?? "").slice(0, 16),
    from: String(parsed.from ?? "").slice(0, 16),
    message: String(parsed.message ?? "").slice(0, 80),
    tone: isTone(parsed.tone) ? parsed.tone : EMPTY_LETTER.tone,
  };
}

export function saveDraft(letter: Letter): void {
  write(DRAFT_KEY, letter);
}

function isTone(value: unknown): value is Tone {
  return value === "heart" || value === "easy" || value === "poem" || value === "play";
}

/* ------------------------------------------------- letters I created --- */

export function loadMine(): CreatedLetter[] {
  const list = read<CreatedLetter[]>(MINE_KEY, []);
  return Array.isArray(list) ? list.filter(isCreatedLetter) : [];
}

/** Newest first, de-duplicated by id. */
export function rememberCreated(entry: CreatedLetter): CreatedLetter[] {
  const next = [entry, ...loadMine().filter((item) => item.id !== entry.id)].slice(
    0,
    MINE_LIMIT,
  );
  write(MINE_KEY, next);
  return next;
}

export function forgetCreated(id: string): CreatedLetter[] {
  const next = loadMine().filter((item) => item.id !== id);
  write(MINE_KEY, next);
  return next;
}

function isCreatedLetter(value: unknown): value is CreatedLetter {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.url === "string";
}

/* ------------------------------------------------------ letters I opened --- */

export type OpenedLetter = Letter & { id: string; openedAt: string };

/** Cache a letter the recipient opened, so reopening it is instant. */
export function rememberOpened(letter: OpenedLetter): void {
  const next = [
    letter,
    ...loadOpened().filter((item) => item.id !== letter.id),
  ].slice(0, OPENED_LIMIT);
  write(OPENED_KEY, next);
}

export function loadOpened(): OpenedLetter[] {
  const list = read<OpenedLetter[]>(OPENED_KEY, []);
  return Array.isArray(list) ? list.filter(isOpenedLetter) : [];
}

function isOpenedLetter(value: unknown): value is OpenedLetter {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.message === "string";
}
