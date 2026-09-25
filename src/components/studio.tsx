"use client";

import { useMemo, useState } from "react";
import { Copy, Download, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { LetterCard } from "@/components/letter-card";
import { Button } from "@/components/ui/button";
import {
  TEMPLATES,
  TONES,
  WHO,
  formatLetterText,
  type Letter,
  type Tone,
} from "@/lib/blessings";
import { createLetterFn } from "@/lib/letters.fns";
import type { CreatedLetter } from "@/lib/local-store";
import { downloadPoster, sharePoster } from "@/lib/poster";
import { cn } from "@/lib/utils";

type StudioProps = {
  letter: Letter;
  onChange: (patch: Partial<Letter>) => void;
  onCreated: (entry: CreatedLetter) => void;
};

export function Studio({ letter, onChange, onCreated }: StudioProps) {
  const [busy, setBusy] = useState<"copy" | "save" | "share" | "create" | null>(
    null,
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const templates = useMemo(
    () => TEMPLATES.filter((item) => item.tone === letter.tone),
    [letter.tone],
  );

  function applyTone(tone: Tone) {
    onChange({ tone });
    setPicked(null);
  }

  function applyTemplate(id: string, text: string) {
    setPicked(id);
    onChange({ message: text });
  }

  async function onCreate() {
    if (!letter.message.trim()) {
      toast("先写一句正文，再创建分享链接");
      return;
    }
    setBusy("create");
    try {
      const result = await createLetterFn({
        data: {
          to: letter.to.trim(),
          from: letter.from.trim(),
          tone: letter.tone,
          message: letter.message.trim(),
        },
      });
      if (!result.ok) {
        toast("创建太频繁了，歇一会儿再试");
        return;
      }
      setShareUrl(result.url);
      onCreated({
        id: result.id,
        to: letter.to.trim(),
        from: letter.from.trim(),
        url: result.url,
        createdAt: new Date().toISOString(),
      });
      await copyText(result.url, "链接已生成并复制");
    } catch {
      toast("创建失败，请稍后重试");
    } finally {
      setBusy(null);
    }
  }

  async function onCopy() {
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(formatLetterText(letter));
      toast("月笺已复制");
    } catch {
      toast("复制失败，请长按文字手动复制");
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    setBusy("save");
    try {
      await downloadPoster(letter);
      toast("海报已保存");
    } catch {
      toast("保存失败，请稍后重试");
    } finally {
      setBusy(null);
    }
  }

  async function onShare() {
    setBusy("share");
    try {
      const ok = await sharePoster(letter, formatLetterText(letter));
      if (!ok) {
        await navigator.clipboard.writeText(formatLetterText(letter));
        toast("当前环境不能直接分享，已复制文字");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast("分享取消或失败");
    } finally {
      setBusy(null);
    }
  }

  async function copyText(text: string, okMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMessage);
    } catch {
      // Clipboard access is blocked outside a secure context, so the link
      // still has to be visible and selectable.
      toast("链接已生成，请长按复制");
    }
  }

  return (
    <section id="studio" className="flex scroll-mt-8 flex-col gap-6">
      <div className="rounded-3xl bg-surface p-6 shadow-[var(--shadow-border)]">
        <p className="text-xs tracking-hero text-muted">写一封月笺</p>
        <h2 className="mt-3 font-display text-2xl font-medium tracking-tight text-fg">
          给一个人的月亮
        </h2>

        <label className="mt-8 block text-xs tracking-label text-muted" htmlFor="letter-to">
          写给
        </label>
        <input
          id="letter-to"
          className="field mt-1 text-lg"
          value={letter.to}
          onChange={(e) => onChange({ to: e.target.value })}
          placeholder="想念的人"
          maxLength={16}
          autoComplete="off"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {WHO.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onChange({ to: item.value })}
              className={cn(
                "h-11 rounded-full px-4 text-sm transition-[background-color,color,box-shadow] duration-150 ease-out",
                letter.to === item.value
                  ? "bg-accent text-accent-fg"
                  : "text-muted shadow-[var(--shadow-border)] hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <p className="mt-8 text-xs tracking-label text-muted">语气</p>
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-bg p-1">
          {TONES.map((tone) => (
            <button
              key={tone.id}
              type="button"
              onClick={() => applyTone(tone.id)}
              className={cn(
                "h-11 rounded-lg text-sm transition-[background-color,color] duration-150 ease-out",
                letter.tone === tone.id
                  ? "bg-surface text-fg shadow-[var(--shadow-border)]"
                  : "text-muted hover:text-fg",
              )}
            >
              {tone.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">
          {TONES.find((t) => t.id === letter.tone)?.hint}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {templates.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => applyTemplate(item.id, item.text)}
              className={cn(
                "rounded-xl px-4 py-3 text-left text-sm leading-relaxed text-fg/90 transition-[background-color,box-shadow] duration-150 ease-out",
                picked === item.id
                  ? "bg-bg shadow-[var(--shadow-border-hover)]"
                  : "bg-bg/60 shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
              )}
            >
              {item.text}
            </button>
          ))}
        </div>

        <label className="mt-8 block text-xs tracking-label text-muted" htmlFor="letter-msg">
          正文
        </label>
        <textarea
          id="letter-msg"
          className="field textarea mt-1"
          value={letter.message}
          onChange={(e) => {
            setPicked(null);
            onChange({ message: e.target.value.slice(0, 80) });
          }}
          placeholder="今晚想说的话，写在这里。"
          maxLength={80}
        />
        <p className="mt-2 text-right text-xs tabular-nums text-muted">
          {letter.message.length}/80
        </p>

        <label className="mt-4 block text-xs tracking-label text-muted" htmlFor="letter-from">
          署名
        </label>
        <input
          id="letter-from"
          className="field mt-1"
          value={letter.from}
          onChange={(e) => onChange({ from: e.target.value })}
          placeholder="你的名字，或一个只有对方知道的称呼"
          maxLength={16}
          autoComplete="off"
        />
      </div>

      <LetterCard letter={letter} />

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          size="lg"
          onClick={onCreate}
          disabled={busy !== null}
        >
          <Link2 className="size-4" strokeWidth={1.75} />
          {busy === "create" ? "正在创建" : "创建分享链接"}
        </Button>

        {shareUrl ? (
          <div className="rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
            <p className="text-xs tracking-label text-muted">分享链接</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 bg-transparent text-sm text-accent outline-none"
                aria-label="分享链接"
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="复制链接"
                onClick={() => copyText(shareUrl, "链接已复制")}
              >
                <Copy className="size-4" strokeWidth={1.75} />
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
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
            onClick={onCopy}
            disabled={busy !== null}
          >
            <Copy className="size-4" strokeWidth={1.75} />
            {busy === "copy" ? "复制中" : "复制文字"}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="sm:flex-none"
            onClick={onShare}
            disabled={busy !== null}
          >
            <Share2 className="size-4" strokeWidth={1.75} />
            分享
          </Button>
        </div>
      </div>
    </section>
  );
}
