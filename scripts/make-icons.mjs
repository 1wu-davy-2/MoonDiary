#!/usr/bin/env node
/**
 * Regenerate the PWA icons from `public/moon.jpg`.
 *
 * Rasterizing needs a browser, and Playwright is already a dev dependency for
 * the smoke test — cheaper than adding a native image library to the image.
 *
 *   node scripts/make-icons.mjs
 */
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIZES = [180, 512];

const browser = await chromium.launch();
try {
  const moon = await readFile(join(root, "public", "moon.jpg"));
  const dataUrl = `data:image/jpeg;base64,${moon.toString("base64")}`;

  for (const size of SIZES) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    // The moon is square and already dark-edged, so a plain cover-fit circle
    // on the brand background reads correctly at both sizes.
    await page.setContent(`
      <style>
        html, body { margin: 0; width: ${size}px; height: ${size}px; background: #0c0d12; }
        img { width: 100%; height: 100%; object-fit: cover; display: block; }
      </style>
      <img src="${dataUrl}" alt="">
    `);
    await page.waitForLoadState("networkidle");
    const png = await page.screenshot({ type: "png" });
    await writeFile(join(root, "public", `icon-${size}.png`), png);
    await page.close();
    console.log(`[icons] wrote public/icon-${size}.png`);
  }
} finally {
  await browser.close();
}
