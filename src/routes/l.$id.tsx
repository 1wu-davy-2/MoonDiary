import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Copy, Download, PenLine, Share2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import { LetterCard } from "@/components/letter-card";
import { NightSky } from "@/components/night-sky";
import { Button } from "@/components/ui/button";
import { formatLetterText, type Letter } from "@/lib/blessings";
import { formatDate } from "@/lib/format";
import { fetchLetterFn, recordLetterViewFn } from "@/lib/letters.fns";
import { rememberOpened } from "@/lib/local-store";
import { downloadPoster, sharePoster } from "@/lib/poster";

export const Route = createFileRoute("/l/$id")({
  loader: async ({ params }) => {
    const data = await fetchLetterFn({ data: { id: params.id } });
    // A real 404 rather than a 200 with a "not found" body — a stale link
    // should not look like a working page to a crawler or a link checker.
    if (!data.letter) throw notFound();
    return { letter: data.letter, baseUrl: data.baseUrl };
  },
  head: ({ loaderData }) => {
    // `head` also runs on the client, where a route that threw `notFound` has
    // no loader data. Fall back to the root's generic card.
    if (!loaderData) return { meta: [{ title: "月笺 · 中秋祝福" }] };

    const { letter, baseUrl: base } = loaderData;
    const title = `写给${letter.to || "月亮"}的月笺`;
    const image = `${base}/og.jpg`;
    const url = `${base}/l/${letter.id}`;

    return {
      meta: [
        { title: `${title} · 月笺` },
        { name: "description", content: letter.message },
        { property: "og:title", content: title },
        { property: "og:description", content: letter.message },
        { property: "og:image", content: image },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: SharePage,
  notFoundComponent: MissingLetter,
});

function SharePage() {
  const { letter, baseUrl } = Route.useLoaderData();
  const { id } = Route.useParams();
  const [busy, setBusy] = useState<"save" | "copy" | "share" | null>(null);
  const counted = useRef(false);

  // Count the open once the page is actually on screen. Doing this in the
  // loader would also count link-preview crawlers and route prefetches.
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    void recordLetterViewFn({ data: { id } }).catch(() => {
      /* a missed view is not worth surfacing to the recipient */
    });
  }, [id]);

  // Keep a copy in this browser so reopening is instant and works offline.
  useEffect(() => {
    rememberOpened({
      id: letter.id,
      to: letter.to,
      from: letter.from,
      tone: letter.tone,
      message: letter.message,
      openedAt: new Date().toISOString(),
    });
  }, [letter]);

  const asLetter: Letter = {
    to: letter.to,
    from: letter.from,
    tone: letter.tone,
    message: letter.message,
  };
  const shareUrl = `${baseUrl}/l/${letter.id}`;

  async function onSave() {
    setBusy("save");
    try {
      await downloadPoster(asLetter);
      toast("海报已保存");
    } catch {
      toast("保存失败，请稍后重试");
    } finally {
      setBusy(null);
    }
  }

  async function onCopy() {
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast("链接已复制");
    } catch {
      toast("复制失败，请长按链接手动复制");
    } finally {
      setBusy(null);
    }
  }

  async function onShare() {
    setBusy("share");
    try {
      const ok = await sharePoster(asLetter, formatLetterText(asLetter));
      if (!ok) {
        await navigator.clipboard.writeText(formatLetterText(asLetter));
        toast("当前环境不能直接分享，已复制文字");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast("分享取消或失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-bg text-fg">
      <NightSky />
      <div className="grain" />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-8">
        <header className="safe-pad flex items-center justify-between pb-6">
          {/* h-11 keeps the tap target at the 44px mobile guideline rather than
              the ~20px the bare text would give. */}
          <Link to="/" className="inline-flex h-11 items-center text-sm tracking-brand text-fg">
            月笺
          </Link>
          <p className="text-xs tracking-label text-muted">
            {formatDate(letter.createdAt)}
          </p>
        </header>

        <main className="rise-in flex flex-1 flex-col justify-center gap-6">
          <LetterCard letter={asLetter} dateText={formatDate(letter.createdAt)} />
        </main>

        <div className="safe-pad mt-6 flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={onSave}
              disabled={busy !== null}
            >
              <Download className="size-4" strokeWidth={1.75} />
              {busy === "save" ? "正在生成" : "保存海报"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={onShare}
              disabled={busy !== null}
            >
              <Share2 className="size-4" strokeWidth={1.75} />
              分享
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="lg"
              className="flex-1"
              onClick={onCopy}
              disabled={busy !== null}
            >
              <Copy className="size-4" strokeWidth={1.75} />
              {busy === "copy" ? "复制中" : "复制链接"}
            </Button>
            <Button variant="ghost" size="lg" className="flex-1" asChild>
              <Link to="/">
                <PenLine className="size-4" strokeWidth={1.75} />
                写一封回信
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{
          className:
            "font-sans border-0 bg-surface text-fg shadow-[var(--shadow-border)]",
        }}
      />
    </div>
  );
}

/** A share code that does not resolve — most likely a typo or a stale link. */
function MissingLetter() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-bg text-fg">
      <NightSky />
      <div className="grain" />
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-5 text-center">
        <div className="size-24 overflow-hidden rounded-full opacity-40 shadow-[var(--shadow-border)]">
          <img
            src="/moon.jpg"
            alt=""
            className="size-full object-cover outline outline-1 -outline-offset-1 outline-fg/15"
          />
        </div>
        <h1 className="font-display text-2xl font-medium">这盏灯已经灭了</h1>
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          没有找到这封月笺。链接可能抄错了一个字，或者它已经不在了。
        </p>
        <Button variant="primary" size="lg" asChild>
          <Link to="/">写一封新的</Link>
        </Button>
      </div>
    </div>
  );
}
