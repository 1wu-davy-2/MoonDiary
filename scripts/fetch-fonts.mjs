#!/usr/bin/env node
/**
 * 把 Noto Serif SC 抓下来自托管。
 *
 * 为什么要自托管：这个站点的观感高度依赖衬线中文，而 fonts.googleapis.com
 * 在国内手机上基本打不开。降级到系统字体后，iOS 有「宋体」还撑得住，但国内
 * 安卓普遍不带衬线中文字体，会掉到无衬线，贺卡的气质就没了。
 *
 * Google 返回的 CSS 是按 unicode-range 切成上百个小片的，浏览器只会下载页面
 * 真正用到的那几片 —— 所以自托管不等于让用户下几 MB，一页通常只有 200-400KB。
 *
 *   node scripts/fetch-fonts.mjs
 *
 * 产物：public/fonts/*.woff2 + public/fonts/noto-serif-sc.css
 * 只需在字体或字重变化时重跑；产物要提交进仓库。
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "fonts");

/** 页面里只用到 font-medium(500) 和默认的 400，不要多抓。 */
const WEIGHTS = [400, 500];
const FAMILY = "Noto Serif SC";
const CSS_URL =
  `https://fonts.googleapis.com/css2?family=${FAMILY.replace(/ /g, "+")}` +
  `:wght@${WEIGHTS.join(";")}&display=swap`;

/**
 * 必须伪装成现代浏览器。用 curl 或老 UA 请求时 Google 会返回 TTF，
 * 那样下下来的是几 MB 的整包，unicode-range 分片也没了。
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const slug = FAMILY.toLowerCase().replace(/\s+/g, "-");

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

async function fetchBinary(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

console.log(`[fonts] 拉取 CSS…`);
const css = await fetchText(CSS_URL);
if (!css.includes("woff2")) {
  throw new Error("返回的不是 woff2 —— 检查 User-Agent，别下成 TTF 整包。");
}

/** 每个 @font-face 块单独处理，好把字重和文件对应起来命名。 */
const blocks = css.split("@font-face").slice(1);
if (blocks.length === 0) throw new Error("CSS 里没有 @font-face，格式可能变了。");

// 清掉上一次的产物，避免改字重后留下孤儿文件。
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// 先把每个分片的 URL 收集起来，下载后按内容算出文件名，再回填进 CSS。
// 文件名带内容哈希才能在 vite.config.ts 里放心地标 immutable ——
// 否则改了字重、分片内容变了而文件名没变，浏览器会一直用旧的。
const counters = new Map();
const jobs = [];

for (const block of blocks) {
  const weight = /font-weight:\s*(\d+)/.exec(block)?.[1] ?? "400";
  const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(block)?.[1];
  if (!url) continue;

  const index = counters.get(weight) ?? 0;
  counters.set(weight, index + 1);
  jobs.push({ block, url, weight, index, file: null });
}

console.log(`[fonts] 需要下载 ${jobs.length} 个分片`);

// 并发下载，但要限流 —— 一口气几百个请求会被 CDN 掐。
const CONCURRENCY = 8;
let done = 0;
for (let i = 0; i < jobs.length; i += CONCURRENCY) {
  await Promise.all(
    jobs.slice(i, i + CONCURRENCY).map(async (job) => {
      const bytes = await fetchBinary(job.url);
      const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
      job.file = `${slug}-${job.weight}-${job.index}.${hash}.woff2`;
      await writeFile(join(outDir, job.file), bytes);
      done += 1;
      if (done % 40 === 0) console.log(`[fonts] ${done}/${jobs.length}`);
    }),
  );
}

// 回填本地路径，顺序与原始 CSS 一致（unicode-range 的先后有意义）。
const byBlock = new Map(jobs.map((j) => [j.block, j.file]));
const rewritten = blocks.map((block) => {
  const file = byBlock.get(block);
  if (!file) return `@font-face${block}`;
  return `@font-face${block.replace(/url\(https:\/\/fonts\.gstatic\.com\/[^)]+\)/, `url(/fonts/${file})`)}`;
});

const cssName = `${slug}.css`;
const header = `/* 由 scripts/fetch-fonts.mjs 生成 —— 请勿手改。字体：${FAMILY} (${WEIGHTS.join(", ")}) */\n`;
await writeFile(join(outDir, cssName), header + rewritten.join(""), "utf8");

console.log(`[fonts] 完成：${jobs.length} 个 woff2 + ${cssName} -> public/fonts/`);
console.log(`[fonts] 在 __root.tsx 里引用 /fonts/${cssName}`);
