#!/usr/bin/env node
/**
 * 把页面用到的图片压到实际显示尺寸。
 *
 * 原图是给印刷/大屏准备的：moon.jpg 是 1408×1408 / 457KB，但页面上最大只画到
 * 288 CSS px（两倍屏 576px），海报里是 472px。直接发原图，手机端要为此多下
 * 几百 KB —— 对主要走移动网络的受众是实打实的浪费。
 *
 * 原图放在 assets/source/（不进 Docker 镜像、不作为静态资源提供），
 * 本脚本从那里读，生成到 public/。要换图就替换 assets/source/ 里的文件再跑一次。
 *
 *   node scripts/optimize-images.mjs
 */
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "assets", "source");
const outDir = join(root, "public");

/**
 * 目标宽度按"显示尺寸 × 2"取，覆盖两倍屏。
 *   moon.jpg       页面上最大 size-72 = 288px → 576；海报画 472 → 640 都够
 *   osmanthus.jpg  页面固定 h-56 = 224px，3:4 比例 → 宽 336；取 400 留余量
 */
const TARGETS = [
  { file: "moon.jpg", width: 640, quality: 82 },
  { file: "osmanthus.jpg", width: 400, quality: 78 },
];

const browser = await chromium.launch();
try {
  for (const { file, width, quality } of TARGETS) {
    const source = await readFile(join(srcDir, file));
    const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
    const dataUrl = `data:${mime};base64,${source.toString("base64")}`;

    const page = await browser.newPage({ viewport: { width: 10, height: 10 } });
    const reencoded = await page.evaluate(
      async ({ dataUrl, width, quality }) => {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();

        const scale = Math.min(1, width / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        return { dataUrl: canvas.toDataURL("image/jpeg", quality), w, h };
      },
      { dataUrl, width, quality },
    );
    await page.close();

    const bytes = Buffer.from(reencoded.dataUrl.split(",")[1], "base64");
    await writeFile(join(outDir, file), bytes);
    console.log(
      `[images] ${file}: ${(source.length / 1024).toFixed(0)} KB -> ` +
        `${(bytes.length / 1024).toFixed(0)} KB  (${reencoded.w}×${reencoded.h})`,
    );
  }
} finally {
  await browser.close();
}
