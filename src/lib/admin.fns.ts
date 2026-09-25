import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Admin entry points.
 *
 * Every handler below re-checks the session itself. The route loaders also
 * gate, but that gate is only a rendering decision — a server function is a
 * plain HTTP endpoint, so anything reachable from the client must defend
 * itself rather than trust that a loader ran first.
 *
 * These are `createServerFn` rather than plain route handlers on purpose: the
 * framework attaches its CSRF middleware to server functions, and a bare
 * `POST /api/...` route would not get it.
 */

/** Failed sign-ins allowed per address inside the window. */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

async function requireAdmin(): Promise<boolean> {
  const { readAdminSession } = await import("./server/admin-session");
  return (await readAdminSession()) !== null;
}

/**
 * Every admin response is cookie-dependent. `method: "GET"` server functions
 * are GETs over HTTP, so without this a shared cache could hand one operator's
 * dashboard to the next visitor.
 */
function noStore(): void {
  setResponseHeader("cache-control", "no-store");
}

export const adminSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  noStore();
  const { readAdminSession, usingDefaultPassword } = await import(
    "./server/admin-session"
  );
  return {
    user: await readAdminSession(),
    usingDefaultPassword: usingDefaultPassword(),
  };
});

export const adminLoginFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().min(1).max(64),
      password: z.string().min(1).max(200),
    }),
  )
  .handler(async ({ data }) => {
    noStore();
    const [{ verifyCredentials, signInAdmin }, { clientIp }, { rateLimiter }] =
      await Promise.all([
        import("./server/admin-session"),
        import("./server/request-ip"),
        import("./server/rate-limit"),
      ]);

    const limiter = rateLimiter("admin-login", {
      windowMs: LOGIN_WINDOW_MS,
      max: LOGIN_MAX_FAILURES,
    });
    const key = clientIp();

    if (limiter.isLimited(key)) {
      return { ok: false as const, reason: "throttled" as const };
    }
    if (!verifyCredentials(data.username, data.password)) {
      limiter.record(key);
      return { ok: false as const, reason: "invalid" as const };
    }

    limiter.clear(key);
    await signInAdmin(data.username);
    return { ok: true as const, reason: null };
  });

export const adminLogoutFn = createServerFn({ method: "POST" }).handler(async () => {
  noStore();
  const { signOutAdmin } = await import("./server/admin-session");
  await signOutAdmin();
  return { ok: true as const };
});

export const adminStatsFn = createServerFn({ method: "GET" }).handler(async () => {
  noStore();
  if (!(await requireAdmin())) return null;
  const { getAdminStats } = await import("./server/letters");
  return getAdminStats();
});

const listSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  search: z.string().trim().max(64).default(""),
});

export const adminLettersFn = createServerFn({ method: "GET" })
  .validator(listSchema)
  .handler(async ({ data }) => {
    noStore();
    if (!(await requireAdmin())) return null;
    const { listLettersForAdmin } = await import("./server/letters");
    return listLettersForAdmin({
      page: data.page,
      pageSize: 20,
      search: data.search,
    });
  });

export const adminLetterDetailFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().trim().min(1).max(32) }))
  .handler(async ({ data }) => {
    noStore();
    if (!(await requireAdmin())) return null;
    const { getLetterForAdmin } = await import("./server/letters");
    return getLetterForAdmin(data.id);
  });
