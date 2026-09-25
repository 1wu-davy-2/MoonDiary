import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

const APP_NAME = "月笺";
const APP_DESCRIPTION = "写一封只给一个人看的月亮。中秋月笺。";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${APP_NAME} · 中秋祝福` },
      { name: "description", content: APP_DESCRIPTION },
      { name: "theme-color", content: "#0c0d12" },
      // Share-card defaults. The `/l/$id` route overrides title/description
      // with the letter's own text so a link previews with its actual content.
      { property: "og:site_name", content: APP_NAME },
      { property: "og:type", content: "website" },
      { property: "og:title", content: `${APP_NAME} · 中秋祝福` },
      { property: "og:description", content: APP_DESCRIPTION },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/icon-180.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      /**
       * Self-hosted, not fonts.googleapis.com — that host is unreachable from
       * mainland China, and without it Android falls back to a sans-serif CJK
       * face and the whole card loses its look. Regenerate with
       * `npm run fonts`; the unicode-range slicing means a page only downloads
       * the few hundred KB it actually needs.
       */
      { rel: "stylesheet", href: "/fonts/noto-serif-sc.css" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: () => (
    <html lang="zh-CN" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
