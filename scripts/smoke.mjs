#!/usr/bin/env node
/**
 * End-to-end smoke test for 月笺 (the Mid-Autumn greeting-card app).
 *
 * Drives a real Chromium through the product's critical path — write a letter,
 * create a share link, open the share page as a recipient would, confirm the
 * missing-letter page is a real 404, sign into the admin dashboard, then repeat
 * the public pages at a phone viewport.
 *
 * Progress goes to stderr; a single JSON verdict goes to stdout so the run can
 * be piped into a checker. Exit code is 0 when every check passed, 1 otherwise.
 *
 * Usage:
 *   node scripts/smoke.mjs
 *   SMOKE_BASE_URL=http://127.0.0.1:8081 node scripts/smoke.mjs
 */

import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

/* ------------------------------------------------------------ config --- */

// Everything is resolved relative to this file so the script runs from any cwd
// and on any OS (no hardcoded absolute paths).
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shotDir = join(root, "screenshots");

const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8080").replace(
  /\/+$/,
  "",
);

const STEP_TIMEOUT = 15_000;

/**
 * `networkidle` never settles against the Vite dev server — its HMR channel and
 * the streaming SSR response keep the connection busy — so navigation waits for
 * `domcontentloaded` and every assertion waits for its own selector instead.
 */
const NAV = { waitUntil: "domcontentloaded" };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

/** The code the app generates for a share link: 8 chars, no 0/O/1/l/I. */
const SHARE_CODE_RE = /\/l\/([23456789abcdefghjkmnpqrstuvwxyz]{8})$/;

/** The deliberately-missing letter the 404 check navigates to. */
const MISSING_LETTER_URL = "/l/zzzzzzzz";

/**
 * Console noise that is not an app defect. Each entry carries its reason, so
 * the ignore list cannot quietly grow into "anything inconvenient".
 *
 * `test` receives the message text and the URL the browser attributed it to.
 */
const BENIGN_CONSOLE = [
  {
    // Chromium probes /favicon.ico on its own even though the document declares
    // /favicon.svg. The app never asked for it and it is not served.
    test: (text, url) => /favicon\.ico/.test(`${text} ${url}`) && /\b404\b/.test(text),
    why: "browser-initiated /favicon.ico probe; the app declares /favicon.svg",
  },
  {
    // Navigating to the missing-letter page returns a real 404 by design (that
    // is exactly what the smoke test asserts), and Chromium logs the document
    // load as a console error. Expected here, not a defect.
    test: (text, url) => url.includes(MISSING_LETTER_URL) && /\b404\b/.test(text),
    why: `${MISSING_LETTER_URL} is deliberately a 404; the browser logs the document load`,
  },
  {
    // React's dev-only "download the React DevTools" nudge.
    test: (text) => /React DevTools/i.test(text),
    why: "React DevTools dev-only hint, not an app error",
  },
];

function benignReason(text, url = "") {
  const hit = BENIGN_CONSOLE.find((entry) => entry.test(text, url));
  return hit ? hit.why : null;
}

/* ------------------------------------------------------------ state --- */

const checks = [];
const screenshots = [];
/** @type {string[]} */
const consoleErrors = [];

function log(line) {
  process.stderr.write(`[smoke] ${line}\n`);
}

function record(name, ok, detail = "") {
  const passed = Boolean(ok);
  checks.push({ name, ok: passed, detail: String(detail) });
  log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return passed;
}

function attachErrorCollectors(page, label) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Chromium's "Failed to load resource" text omits the URL; it only appears
    // in the message location, which is what makes the 404 rules above work.
    const url = msg.location()?.url ?? "";
    const why = benignReason(text, url);
    if (why) {
      log(`ignored console error (${label}): ${text} ${url}  [${why}]`);
      return;
    }
    consoleErrors.push(`${label} [console] ${text}${url ? ` (${url})` : ""}`);
  });
  page.on("pageerror", (error) => {
    const text = error?.stack ?? error?.message ?? String(error);
    if (benignReason(text)) return;
    consoleErrors.push(`${label} [pageerror] ${text}`);
  });
}

/**
 * Wait until React has hydrated the given element.
 *
 * React brands every DOM node it manages with an internal `__reactFiber$…`
 * property, so its presence is a direct, race-free signal that the page is
 * interactive. Without this, typing can land before hydration and be reverted
 * by React's first render, which makes the run flaky rather than failing.
 */
async function waitForHydration(page, selector) {
  return page
    .waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        return Object.getOwnPropertyNames(el).some((key) =>
          key.startsWith("__reactFiber$") || key.startsWith("__reactProps$"),
        );
      },
      selector,
      { timeout: STEP_TIMEOUT },
    )
    .then(() => true)
    .catch(() => false);
}

/* ----------------------------------------------------------- helpers --- */

/**
 * A value that changes every run, so a stale page or a cached response cannot
 * make a later run look green.
 */
const token = randomBytes(4).toString("hex");
const recipient = `测试收件人${token.slice(0, 4)}`;
const sender = `烟测${token.slice(0, 4)}`;
const message = `今晚月色很好，记得抬头看看。${token}`;

/**
 * Fill a field and confirm the value stuck.
 *
 * The form is a controlled React component, so typing before hydration finishes
 * gets silently reverted when React mounts. Re-typing after a short settle is
 * enough to win that race.
 */
async function fillField(page, selector, value) {
  const field = page.locator(selector);
  await field.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await field.fill(value);
    await page.waitForTimeout(250);
    if ((await field.inputValue()) === value) return;
    log(`retrying ${selector}: React reverted the typed value (attempt ${attempt + 1})`);
  }
  throw new Error(`could not type into ${selector}`);
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    };
  });
}

/** Names of elements sticking out past the viewport — used only in failure text. */
async function overflowOffenders(page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > limit + 1) {
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
      }
      if (out.length >= 5) break;
    }
    return out;
  });
}

async function checkNoOverflow(page, name) {
  const { scrollWidth, clientWidth } = await overflow(page);
  const ok = scrollWidth <= clientWidth;
  let detail = `scrollWidth=${scrollWidth} clientWidth=${clientWidth}`;
  if (!ok) {
    const offenders = await overflowOffenders(page);
    detail += ` offenders=${JSON.stringify(offenders)}`;
  }
  return record(name, ok, detail);
}

async function shoot(page, filename) {
  const path = join(shotDir, filename);
  // Blur first so no text caret is mid-blink in the capture, and pass
  // `caret: "initial"` because Playwright's default caret hiding writes
  // `style="caret-color: transparent"` onto every input and then "restores" it
  // to an empty `style` attribute rather than removing it. That stray attribute
  // is visible to React at hydration time and makes it log a bogus
  // hydration-mismatch error, which would fail this run for no real reason.
  await page.evaluate(() => document.activeElement?.blur?.()).catch(() => {});
  await page.screenshot({ path, fullPage: false, caret: "initial" });
  screenshots.push(path);
  log(`screenshot ${path}`);
  return path;
}

/** Read a `<meta>` tag's content, tolerating either attribute order. */
function metaContent(html, key) {
  const tag = new RegExp(
    `<meta[^>]*(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i",
  ).exec(html);
  if (!tag) return null;
  const content = /content=["']([^"']*)["']/i.exec(tag[0]);
  return content ? decodeEntities(content[1]) : null;
}

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/* -------------------------------------------------------------- main --- */

async function main() {
  await mkdir(shotDir, { recursive: true });

  // Fail fast with a readable message if the dev server is not up.
  const health = await fetch(`${baseUrl}/api/health`).catch((error) => {
    throw new Error(`dev server not reachable at ${baseUrl}: ${error.message}`);
  });
  const healthBody = await health.text();
  record(
    "dev server /api/health responds ok",
    health.ok && healthBody.includes('"ok":true'),
    `${health.status} ${healthBody.slice(0, 80)}`,
  );
  if (!health.ok) throw new Error(`dev server unhealthy at ${baseUrl}`);

  const browser = await chromium.launch();
  let shareUrl = null;
  let shareCode = null;

  try {
    /* ---------------------------------------------------- desktop --- */
    const desktop = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const page = await desktop.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT);
    attachErrorCollectors(page, "desktop");

    log("--- desktop 1280x800: home page ---");
    await page.goto(`${baseUrl}/`, NAV);

    const heading = page.getByRole("heading", { name: "今晚月圆", level: 1 });
    const headingVisible = await heading
      .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
      .then(() => true)
      .catch(() => false);
    record("desktop home: heading 今晚月圆 is visible", headingVisible);
    record(
      "desktop home: studio form is present",
      await page.locator("#letter-msg").isVisible(),
    );
    await checkNoOverflow(page, "desktop home: no horizontal overflow");
    await shoot(page, "smoke-desktop.png");

    log("--- desktop: create a letter ---");
    record(
      "desktop home: React hydrates and wires up the studio form",
      await waitForHydration(page, "#letter-msg"),
    );

    await fillField(page, "#letter-to", recipient);
    await fillField(page, "#letter-msg", message);
    await fillField(page, "#letter-from", sender);

    // The live preview card renders only from React state, so seeing the text
    // there proves hydration finished and the form is actually wired up —
    // clicking "创建分享链接" before that would hit an inert button.
    const previewWired = await page
      .getByText(message, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
      .then(() => true)
      .catch(() => false);
    record("desktop create: live preview reflects the typed message", previewWired);

    await page.getByRole("button", { name: /创建分享链接/ }).click();

    const shareInput = page.locator('input[aria-label="分享链接"]');
    const shareInputAppeared = await shareInput
      .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
      .then(() => true)
      .catch(() => false);
    record("desktop create: share-link input appears", shareInputAppeared);

    if (shareInputAppeared) {
      shareUrl = (await shareInput.inputValue()).trim();
    }
    shareCode = shareUrl ? (SHARE_CODE_RE.exec(shareUrl)?.[1] ?? null) : null;
    record(
      "desktop create: share URL looks like <base>/l/<8-char code>",
      Boolean(shareCode) && shareUrl.startsWith(baseUrl),
      shareUrl ?? "(no share URL)",
    );

    /* ------------------------------------------- share page (SSR) --- */
    log("--- share page: raw SSR HTML (what a WeChat/QQ crawler sees) ---");
    if (shareUrl) {
      const response = await fetch(shareUrl);
      const rawHtml = await response.text();
      // React separates adjacent text nodes with <!-- --> markers; strip them
      // so a legitimate render is not reported as a miss.
      const html = rawHtml.replace(/<!--.*?-->/g, "");

      record(
        "share SSR: HTTP 200",
        response.status === 200,
        `status=${response.status}`,
      );
      record(
        "share SSR: letter message is in the server-rendered HTML",
        html.includes(message),
        html.includes(message) ? "found message verbatim" : "message missing from SSR HTML",
      );

      const ogTitle = metaContent(rawHtml, "og:title");
      const ogDescription = metaContent(rawHtml, "og:description");
      record(
        "share SSR: og:title contains the recipient name",
        Boolean(ogTitle) && ogTitle.includes(recipient),
        `og:title=${JSON.stringify(ogTitle)}`,
      );
      record(
        "share SSR: og:description contains the message",
        Boolean(ogDescription) && ogDescription.includes(message),
        `og:description=${JSON.stringify(ogDescription)}`,
      );

      log("--- share page: rendered in the browser ---");
      // The page records a view with a server-function POST after mount; wait
      // for that round trip so the assertion happens on a settled page.
      const viewPost = page
        .waitForResponse(
          (res) => res.request().method() === "POST" && res.url().startsWith(baseUrl),
          { timeout: 8000 },
        )
        .catch(() => null);
      await page.goto(shareUrl, NAV);
      const posted = await viewPost;
      if (!posted) log("note: no view POST observed (may already be deduped)");

      const messageOnPage = await page
        .getByText(message, { exact: false })
        .first()
        .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
        .then(() => true)
        .catch(() => false);
      record("desktop share: message is visible on the page", messageOnPage);
      record(
        "desktop share: recipient name is visible on the page",
        await page.getByText(recipient, { exact: false }).first().isVisible(),
      );
      await checkNoOverflow(page, "desktop share: no horizontal overflow");
      await shoot(page, "smoke-desktop-share.png");
    } else {
      record("share page checks", false, "skipped: no share URL was created");
    }

    /* ------------------------------------------- missing letter 404 --- */
    log("--- missing letter: a real 404, not a 200 with an apology ---");
    const missingUrl = `${baseUrl}/l/zzzzzzzz`;
    const missingResponse = await fetch(missingUrl);
    record(
      "missing letter: HTTP status is 404",
      missingResponse.status === 404,
      `status=${missingResponse.status}`,
    );
    const missingHtml = await missingResponse.text();
    record(
      "missing letter: SSR HTML says 这盏灯已经灭了",
      missingHtml.includes("这盏灯已经灭了"),
    );

    await page.goto(missingUrl, NAV);
    const missingVisible = await page
      .getByText("这盏灯已经灭了", { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
      .then(() => true)
      .catch(() => false);
    record("missing letter: 这盏灯已经灭了 is visible in the browser", missingVisible);

    /* ------------------------------------------------------ admin --- */
    log("--- admin: login and dashboard ---");
    await page.goto(`${baseUrl}/admin`, NAV);
    const loginVisible = await page
      .locator("#admin-user")
      .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
      .then(() => true)
      .catch(() => false);
    record("admin: login form appears for an anonymous visitor", loginVisible);

    if (loginVisible) {
      // Same hydration race as the studio form: clicking before React attaches
      // would hit an inert submit button and silently do nothing.
      record(
        "admin: React hydrates the login form",
        await waitForHydration(page, "#admin-user"),
      );
      await fillField(page, "#admin-user", "admin");
      await fillField(page, "#admin-pass", "admin@123");
      await page.getByRole("button", { name: /^登录/ }).click();

      const statsVisible = await page
        .getByText("月笺总数", { exact: false })
        .first()
        .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
        .then(() => true)
        .catch(() => false);
      record("admin: dashboard shows 月笺总数 after login", statsVisible);

      const bodyText = await page.locator("body").innerText();
      record(
        "admin: the new share code is listed on the dashboard",
        Boolean(shareCode) && bodyText.includes(shareCode),
        shareCode ? `looking for ${shareCode}` : "no share code to look for",
      );
      record(
        "admin: default-password warning (后台还在用默认密码) is shown",
        bodyText.includes("后台还在用默认密码"),
      );
      record(
        "admin: logout button is present",
        await page.getByRole("button", { name: /退出登录/ }).isVisible(),
      );
      await shoot(page, "smoke-desktop-admin.png");
    }

    await desktop.close();

    /* ----------------------------------------------------- mobile --- */
    log("--- mobile 390x844 ---");
    const mobile = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const mobilePage = await mobile.newPage();
    mobilePage.setDefaultTimeout(STEP_TIMEOUT);
    attachErrorCollectors(mobilePage, "mobile");

    await mobilePage.goto(`${baseUrl}/`, NAV);
    const mobileHeading = await mobilePage
      .getByRole("heading", { name: "今晚月圆", level: 1 })
      .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
      .then(() => true)
      .catch(() => false);
    record("mobile home: heading 今晚月圆 is visible", mobileHeading);
    record(
      "mobile home: studio form is present",
      await mobilePage.locator("#letter-msg").isVisible(),
    );
    await checkNoOverflow(mobilePage, "mobile home: no horizontal overflow");
    await shoot(mobilePage, "smoke-mobile.png");

    if (shareUrl) {
      await mobilePage.goto(shareUrl, NAV);
      const mobileMessage = await mobilePage
        .getByText(message, { exact: false })
        .first()
        .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
        .then(() => true)
        .catch(() => false);
      record("mobile share: message is visible on the page", mobileMessage);
      await checkNoOverflow(mobilePage, "mobile share: no horizontal overflow");
      await shoot(mobilePage, "smoke-mobile-share.png");
    } else {
      record("mobile share checks", false, "skipped: no share URL was created");
    }

    await mobile.close();

    /* --------------------------------------------------- console --- */
    record(
      "no console or page errors in any viewport",
      consoleErrors.length === 0,
      consoleErrors.length === 0
        ? "clean"
        : `${consoleErrors.length} error(s): ${consoleErrors.join(" | ").slice(0, 400)}`,
    );
  } finally {
    await browser.close();
  }
}

let fatal = null;
try {
  await main();
} catch (error) {
  fatal = error;
  record("smoke run completed without an unexpected exception", false, String(error?.message ?? error));
  log(`FATAL ${error?.stack ?? error}`);
}

const ok = checks.length > 0 && checks.every((check) => check.ok) && !fatal;
const verdict = {
  ok,
  baseUrl,
  checks,
  consoleErrors,
  screenshots,
};

process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
log(ok ? "VERDICT: ok" : "VERDICT: FAILED");
process.exitCode = ok ? 0 : 1;
