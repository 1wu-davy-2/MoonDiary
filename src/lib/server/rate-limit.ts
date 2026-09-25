/**
 * In-memory, per-key rate limiting.
 *
 * Two unauthenticated endpoints can be abused: the admin login form (the
 * documented default password is public knowledge) and letter creation (writes
 * a row every call). Both need a speed bump.
 *
 * This is deliberately modest: state lives in process memory, so it resets on
 * restart and is per-container. It makes sustained guessing or scripted flooding
 * impractical without pretending to be real defence — the actual fixes are
 * setting ADMIN_PASSWORD and putting the site behind a proxy that can filter.
 */

export type RateLimiter = {
  /** True when `key` has already hit the limit inside the window. */
  isLimited(key: string): boolean;
  /** Count one attempt against `key`. */
  record(key: string): void;
  /** Forget `key` — call on success so a legitimate user is not locked out. */
  clear(key: string): void;
};

type Options = {
  windowMs: number;
  max: number;
};

/**
 * Limiters are registered on `globalThis` by name: dev HMR creates a new module
 * instance on every edit, and module-local state would hand out a fresh budget
 * each time, silently disabling the limit while editing.
 */
const globalRef = globalThis as typeof globalThis & {
  __yuejianRateLimiters__?: Map<string, Map<string, number[]>>;
};

const registry = (globalRef.__yuejianRateLimiters__ ??= new Map<
  string,
  Map<string, number[]>
>());

export function rateLimiter(name: string, { windowMs, max }: Options): RateLimiter {
  const hits = registry.get(name) ?? new Map<string, number[]>();
  registry.set(name, hits);

  /** Drop aged-out timestamps so the map cannot grow without bound. */
  function recent(key: string, now: number): number[] {
    const kept: number[] = (hits.get(key) ?? []).filter(
      (at: number) => now - at < windowMs,
    );
    if (kept.length) hits.set(key, kept);
    else hits.delete(key);
    return kept;
  }

  return {
    isLimited(key) {
      return recent(key, Date.now()).length >= max;
    },
    record(key) {
      const now = Date.now();
      hits.set(key, [...recent(key, now), now]);
    },
    clear(key) {
      hits.delete(key);
    },
  };
}
