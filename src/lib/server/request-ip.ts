import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { envFlag, envOr } from "@/lib/env.server";

/** Longest IPv6 textual form with a scope id still fits comfortably. */
const MAX_IP_LENGTH = 64;

/**
 * Best-effort client IP for the request being handled right now.
 *
 * Server-only: these helpers read from the request context, so this throws
 * outside a request (and in the browser).
 *
 * ## Why this does not just call `getRequestIP({ xForwardedFor: true })`
 *
 * That returns the **first** entry of `X-Forwarded-For`. But the nginx template
 * everyone uses (宝塔 included) is
 *
 *     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 *
 * and `$proxy_add_x_forwarded_for` **appends** the peer to whatever the client
 * already sent. So the first entry is whatever the visitor chose to send —
 * `curl -H 'X-Forwarded-For: 1.2.3.4'` would be logged as `1.2.3.4`. Since
 * recording visitor IPs is the point of this table, trusting that entry would
 * make the whole log forgeable.
 *
 * The real client is therefore counted from the **right**: with N trusted
 * proxies in front, the Nth-from-last entry is the first one a proxy wrote
 * rather than the client. `TRUSTED_PROXY_HOPS=1` is the common
 * "one nginx in front" case.
 *
 * `TRUST_PROXY=false` ignores proxy headers entirely and uses the socket peer —
 * required if the app port is ever exposed directly.
 */
export function clientIp(): string {
  if (!envFlag("TRUST_PROXY", true)) return normalizeIp(getRequestIP());

  const hops = Number(envOr("TRUSTED_PROXY_HOPS", "1"));
  if (!Number.isInteger(hops) || hops < 1) return normalizeIp(getRequestIP());

  const forwarded = getRequestHeader("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    // Fewer entries than trusted hops means the chain is shorter than assumed;
    // the leftmost entry is then the best available answer.
    const candidate = chain[Math.max(0, chain.length - hops)];
    if (candidate) return normalizeIp(candidate);
  }

  const realIp = getRequestHeader("x-real-ip");
  if (realIp) return normalizeIp(realIp);

  return normalizeIp(getRequestIP());
}

/**
 * Collapse the shapes an IP can arrive in into one storable value. Node reports
 * IPv4 peers on a dual-stack socket as `::ffff:1.2.3.4`, which would otherwise
 * make the same visitor look like two different addresses.
 */
function normalizeIp(raw: string | undefined): string {
  if (!raw) return "unknown";
  let ip = raw.trim();

  // "[::1]:54321" -> "::1" (bracketed IPv6 with a port)
  const bracketed = /^\[(.+)\]:\d+$/.exec(ip);
  if (bracketed?.[1]) ip = bracketed[1];
  // "1.2.3.4:54321" -> "1.2.3.4" (IPv4 with a port) — only when the colon is
  // unambiguous, so a bare IPv6 address is left alone.
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.split(":")[0] ?? ip;

  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);

  ip = ip.trim();
  return ip ? ip.slice(0, MAX_IP_LENGTH) : "unknown";
}

/** Truncate a user agent / referer to what the schema stores. */
export function clipHeader(raw: string | null | undefined, max: number): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return value.slice(0, max);
}
