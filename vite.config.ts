import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

/**
 * Vite only auto-loads `.env` into `import.meta.env`, and only for `VITE_`
 * keys. Server code reads `process.env`, so without this a local `.env` would
 * be invisible to the database and admin code while compose (which passes real
 * environment variables) worked fine — a confusing split. Existing variables
 * always win, so a shell export or the container environment still overrides.
 */
function loadEnvIntoProcess(mode: string): void {
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * Dev runs on `0.0.0.0:8080` so it is reachable from a phone on the same LAN —
 * useful for checking the mobile layout of a card that is meant to be read on a
 * phone.
 *
 * Builds target Nitro's `node-server` preset, which emits `.output/server/index.mjs`
 * plus `.output/public/` for the Docker image to run. Override with
 * `NITRO_PRESET` if you ever need a different target.
 */
export default defineConfig(({ command, isPreview, mode }) => {
  loadEnvIntoProcess(mode);

  return {
    server: {
      host: "0.0.0.0",
      port: 8080,
      strictPort: true,
    },
    preview: {
      host: "127.0.0.1",
      port: 8081,
      strictPort: true,
    },
    resolve: { tsconfigPaths: true },
    plugins: [
      tailwindcss(),
      tanstackStart(),
      // Only the production build needs a server bundle; dev serves through Vite.
      ...(command === "build" || isPreview
        ? [
            nitro({
              preset: process.env.NITRO_PRESET ?? "node-server",
              /**
               * Off by default, and nothing here is compressible by accident:
               * without it every JS/CSS/HTML byte ships raw. The font stylesheet
               * alone is 205 KB of highly repetitive `unicode-range` lists that
               * gzip takes to roughly a tenth of that — and the audience is on
               * mobile data.
               *
               * Generates `.gz` / `.br` next to each asset at build time; the
               * server picks one from `Accept-Encoding`.
               */
              compressPublicAssets: { gzip: true, brotli: true },
              routeRules: {
                /**
                 * Font slices carry a content hash in the filename
                 * (`…-400-4.1a2b3c4d5e.woff2`), so they can be cached forever.
                 *
                 * Without a rule, nitro serves files from `public/` with only an
                 * ETag and no `Cache-Control`, so the browser revalidates ~20 of
                 * them on every page load. Bundled assets under `/assets/` get
                 * this automatically; `public/` files do not.
                 */
                "/fonts/**": {
                  headers: { "cache-control": "public, max-age=31536000, immutable" },
                },
                /**
                 * The stylesheet keeps a stable name (the app links to it), so it
                 * must NOT be immutable — a font regeneration has to be able to
                 * reach clients. Five minutes is long enough to cover a session's
                 * navigations and short enough that a change lands quickly.
                 *
                 * Listed after `/fonts/**` on purpose; the more specific rule
                 * wins, which is verified by checking the headers after a build.
                 */
                "/fonts/noto-serif-sc.css": {
                  headers: { "cache-control": "public, max-age=300, must-revalidate" },
                },
              },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
