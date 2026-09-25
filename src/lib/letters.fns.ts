import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Client-callable entry points for the public side of the app.
 *
 * Everything past the dynamic `import()` runs on the server only — those
 * imports keep `@/lib/db` and the request helpers out of the client bundle,
 * the same pattern the codebase already used for server-only modules.
 */

const toneSchema = z.enum(["heart", "easy", "poem", "play"]);

/** Stored lengths match the column widths in `migrations/0001_letters.sql`. */
const createSchema = z.object({
  to: z.string().trim().max(16),
  from: z.string().trim().max(16),
  tone: toneSchema,
  message: z.string().trim().min(1, "正文不能为空").max(80),
});

/** Header values the schema stores, clipped to the column widths. */
function requestMetaHeaders() {
  return {
    userAgent: getRequestHeader("user-agent") ?? null,
    referer: getRequestHeader("referer") ?? null,
  };
}

/** Letters one address may create inside the window. */
const CREATE_WINDOW_MS = 60 * 60 * 1000;
const CREATE_MAX_PER_WINDOW = 20;

export const createLetterFn = createServerFn({ method: "POST" })
  .validator(createSchema)
  .handler(async ({ data }) => {
    const [
      { createLetter },
      { clientIp, clipHeader },
      { requestBaseUrl },
      { rateLimiter },
    ] = await Promise.all([
      import("./server/letters"),
      import("./server/request-ip"),
      import("./server/base-url"),
      import("./server/rate-limit"),
    ]);

    // Unauthenticated and writes a row every call — without a ceiling, one
    // script fills the table and every admin page along with it.
    const limiter = rateLimiter("letter-create", {
      windowMs: CREATE_WINDOW_MS,
      max: CREATE_MAX_PER_WINDOW,
    });
    const ip = clientIp();
    if (limiter.isLimited(ip)) {
      return { ok: false as const, reason: "throttled" as const, id: "", url: "" };
    }
    limiter.record(ip);

    const headers = requestMetaHeaders();
    const id = await createLetter(data, {
      ip,
      userAgent: clipHeader(headers.userAgent, 255),
      referer: clipHeader(headers.referer, 255),
    });

    return { ok: true as const, reason: null, id, url: `${requestBaseUrl()}/l/${id}` };
  });

/**
 * Fetch a letter plus the origin it was fetched from. The base URL rides along
 * because `head()` needs an absolute `og:image`/canonical URL, and during SSR
 * there is no `window` to read it from.
 */
export const fetchLetterFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().trim().min(1).max(32) }))
  .handler(async ({ data }) => {
    const [{ getLetter }, { requestBaseUrl }] = await Promise.all([
      import("./server/letters"),
      import("./server/base-url"),
    ]);
    return { letter: await getLetter(data.id), baseUrl: requestBaseUrl() };
  });

/**
 * Log an open. Called from the share page after it mounts rather than from the
 * loader: a loader also runs for link-preview crawlers and route prefetches,
 * which would count opens no person ever made.
 */
export const recordLetterViewFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().trim().min(1).max(32) }))
  .handler(async ({ data }) => {
    const [{ getLetter, recordView }, { clientIp, clipHeader }] = await Promise.all([
      import("./server/letters"),
      import("./server/request-ip"),
    ]);

    // Guard the foreign key: a view row for a letter that does not exist would
    // trip the constraint and surface as a 500 on a page that rendered fine.
    if (!(await getLetter(data.id))) return { counted: false };

    const headers = requestMetaHeaders();
    const counted = await recordView(data.id, {
      ip: clientIp(),
      userAgent: clipHeader(headers.userAgent, 255),
      referer: clipHeader(headers.referer, 255),
    });
    return { counted };
  });
