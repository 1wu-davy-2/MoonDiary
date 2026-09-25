/**
 * Server-only environment access.
 *
 * Reads are lazy — nothing is captured at module scope — so importing this from
 * a module that also reaches the browser bundle never bakes config into the
 * client. Never surface a value from here to the client: only `PUBLIC_BASE_URL`
 * is safe to expose, and it goes through `publicBaseUrl()` below.
 */

/** Trimmed env var, or `undefined` when unset/blank. Blank means unset. */
export function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

export function envOr(key: string, fallback: string): string {
  return env(key) ?? fallback;
}

/** `1` / `true` / `yes` / `on` (case-insensitive) are true. Unset uses `fallback`. */
export function envFlag(key: string, fallback = false): boolean {
  const v = env(key)?.toLowerCase();
  if (v === undefined) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Absolute origin used to build share links.
 *
 * Behind the user's own nginx the request's `Host` header is usually right, so
 * this is an override for the cases where it isn't (a proxy that rewrites Host,
 * or a link generated from a different hostname than the one recipients use).
 * Falls back to `http://localhost:${PORT}` outside a request.
 */
export function publicBaseUrl(): string | undefined {
  const configured = env("PUBLIC_BASE_URL");
  return configured ? configured.replace(/\/+$/, "") : undefined;
}
