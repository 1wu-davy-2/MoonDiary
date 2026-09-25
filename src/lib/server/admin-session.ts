import { createHash, timingSafeEqual } from "node:crypto";
import {
  clearSession,
  getSession,
  updateSession,
} from "@tanstack/react-start/server";
import { env, envFlag, envOr } from "@/lib/env.server";

/**
 * Admin sign-in. Server-only.
 *
 * There is exactly one operator account, configured by environment variable —
 * not a user table. The app itself has no accounts at all; this exists purely
 * to keep a public `/admin` from exposing every letter's text and every
 * visitor's IP to whoever finds the URL.
 *
 * The session cookie is encrypted and integrity-signed by the framework's own
 * `useSession`, so there is no token format to get wrong here.
 */

const COOKIE_NAME = "yuejian_admin";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** Minimum the framework's seal accepts for a session password. */
const MIN_SECRET_LENGTH = 32;

export const DEFAULT_ADMIN_USER = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin@123";

export function adminUser(): string {
  return envOr("ADMIN_USER", DEFAULT_ADMIN_USER);
}

export function adminPassword(): string {
  return envOr("ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD);
}

/** True while the operator has not replaced the documented default. */
export function usingDefaultPassword(): boolean {
  return adminPassword() === DEFAULT_ADMIN_PASSWORD;
}

/**
 * Session sealing key.
 *
 * Falls back to a value derived from the password rather than a random
 * per-boot secret: a random one would silently sign every operator out on each
 * restart, which reads as a bug. Deriving it keeps sessions stable and still
 * changes whenever the password does.
 */
function sessionSecret(): string {
  const configured = env("ADMIN_SESSION_SECRET");
  if (configured && configured.length >= MIN_SECRET_LENGTH) return configured;
  return createHash("sha256")
    .update(`yuejian-admin-session:${adminPassword()}`)
    .digest("hex");
}

function sessionConfig() {
  return {
    password: sessionSecret(),
    name: COOKIE_NAME,
    maxAge: SESSION_MAX_AGE_SECONDS,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      // Off by default so a plain-HTTP trial deploy can still sign in; turn on
      // with COOKIE_SECURE=true once the site is behind HTTPS.
      secure: envFlag("COOKIE_SECURE", false),
    },
  };
}

/** Compare without leaking length or content through timing. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    // Still burn a comparison so a wrong-length guess is not detectably faster.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function verifyCredentials(username: string, password: string): boolean {
  // Both sides are compared regardless, so a correct username alone does not
  // return measurably sooner than a wrong one.
  const userOk = safeEqual(username, adminUser());
  const passOk = safeEqual(password, adminPassword());
  return userOk && passOk;
}

/**
 * These use `getSession` / `updateSession` / `clearSession` rather than the
 * equivalent `useSession` manager: the `use` prefix makes the React Hooks lint
 * rule treat them as hooks, which they are not — they are server-side request
 * helpers. The non-`use` names are the same implementation without the
 * false positive.
 */

/** The signed-in username, or `null`. */
export async function readAdminSession(): Promise<string | null> {
  const session = await getSession<{ user?: string }>(sessionConfig());
  return session.data.user ?? null;
}

export async function signInAdmin(username: string): Promise<void> {
  await updateSession<{ user?: string }>(sessionConfig(), { user: username });
}

export async function signOutAdmin(): Promise<void> {
  await clearSession(sessionConfig());
}
