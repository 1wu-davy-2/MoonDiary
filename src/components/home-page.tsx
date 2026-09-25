"use client";

import { useEffect, useState } from "react";
import { ArrowDown, Trash2 } from "lucide-react";
import { Toaster } from "sonner";
import { LanternField, type Lantern } from "@/components/lantern-field";
import { NightSky } from "@/components/night-sky";
import { Studio } from "@/components/studio";
import { Button } from "@/components/ui/button";
import { EMPTY_LETTER, FESTIVAL, LANTERN_WISHES, type Letter } from "@/lib/blessings";
import {
  forgetCreated,
  loadDraft,
  loadMine,
  rememberCreated,
  saveDraft,
  type CreatedLetter,
} from "@/lib/local-store";
import { prefersReducedMotion } from "@/lib/utils";

export function HomePage() {
  const [letter, setLetter] = useState<Letter>(EMPTY_LETTER);
  const [mine, setMine] = useState<CreatedLetter[]>([]);
  const [lanterns, setLanterns] = useState<Lantern[]>([]);
  // Browser storage is unreadable during SSR, so nothing is loaded until after
  // mount. Rendering the stored values on the server instead would hydrate a
  // different tree than the client renders.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLetter(loadDraft());
    setMine(loadMine());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveDraft(letter);
  }, [letter, ready]);

  function patchLetter(patch: Partial<Letter>) {
    setLetter((prev) => ({ ...prev, ...patch }));
  }

  function onCreated(entry: CreatedLetter) {
    setMine(rememberCreated(entry));
  }

  function onForget(id: string) {
    setMine(forgetCreated(id));
  }

  function releaseLantern() {
    const id = Date.now() + Math.random();
    const next: Lantern = {
      id,
      x: 12 + Math.random() * 70,
      label: LANTERN_WISHES[Math.floor(Math.random() * LANTERN_WISHES.length)] ?? "月圆",
      drift: Math.round((Math.random() - 0.5) * 48),
    };
    setLanterns((prev) => [...prev.slice(-5), next]);
    window.setTimeout(
      () => {
        setLanterns((prev) => prev.filter((item) => item.id !== id));
      },
      prefersReducedMotion() ? 400 : 7200,
    );
  }

  function scrollToStudio() {
    const el = document.getElementById("studio");
    el?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-bg text-fg">
      <NightSky />
      <LanternField lanterns={lanterns} />
      <div className="grain" />

      <div className="relative z-10">
        <header className="safe-pad mx-auto flex max-w-6xl items-center justify-between px-5 pb-2">
          <p className="text-sm tracking-brand text-fg">月笺</p>
          <p className="text-xs tracking-label text-muted">{FESTIVAL.ganzhi} · 中秋</p>
        </header>

        <main className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-4 lg:grid-cols-2 lg:items-start lg:gap-16 lg:pt-8">
          <Hero onWrite={scrollToStudio} onLantern={releaseLantern} />
          <Studio letter={letter} onChange={patchLetter} onCreated={onCreated} />
        </main>

        {ready && mine.length > 0 ? (
          <Mine letters={mine} onForget={onForget} />
        ) : null}

        <footer className="mx-auto max-w-6xl px-5 pb-10 pt-2">
          <p className="text-center text-xs tracking-label text-muted">
            月圆人圆 · 灯还亮着
          </p>
        </footer>
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

/**
 * Letters this browser created. There are no accounts, so this list is the
 * only way back to a link someone forgot to copy — it lives in localStorage
 * and is deliberately easy to clear.
 */
function Mine({
  letters,
  onForget,
}: {
  letters: CreatedLetter[];
  onForget: (id: string) => void;
}) {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-16">
      <div className="rounded-3xl bg-surface p-6 shadow-[var(--shadow-border)]">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs tracking-hero text-muted">我创建过的月笺</h2>
          <p className="text-xs text-muted">只存在这台设备上</p>
        </div>
        <ul className="mt-5 flex flex-col gap-2">
          {letters.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl bg-bg/60 px-4 py-3 shadow-[var(--shadow-border)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">
                  写给 {item.to || "月亮"}
                  {item.from ? <span className="text-muted"> · {item.from}</span> : null}
                </p>
                <a
                  href={item.url}
                  className="mt-1 block truncate text-xs text-accent hover:underline"
                >
                  {item.url}
                </a>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`删除写给${item.to || "月亮"}的月笺记录`}
                onClick={() => onForget(item.id)}
              >
                <Trash2 className="size-4" strokeWidth={1.75} />
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Hero({ onWrite, onLantern }: { onWrite: () => void; onLantern: () => void }) {
  return (
    <section className="flex flex-col items-center pt-2 text-center lg:sticky lg:top-10 lg:items-start lg:pt-6 lg:text-left">
      <p className="rise-in text-xs tracking-hero text-muted">
        {FESTIVAL.gregorian} · {FESTIVAL.lunar}
      </p>

      <div className="rise-in-2 relative mt-8">
        <div className="moon-glow pointer-events-none absolute inset-0 scale-150 rounded-full bg-accent/25 blur-3xl" />
        <div className="relative size-52 overflow-hidden rounded-full shadow-[var(--shadow-border)] sm:size-64 lg:size-72">
          <img
            src="/moon.jpg"
            alt="中秋满月"
            width={1408}
            height={1408}
            className="size-full object-cover outline outline-1 -outline-offset-1 outline-fg/10"
          />
        </div>
      </div>

      <h1 className="rise-in-3 mt-10 font-display text-5xl font-medium tracking-tight text-fg sm:text-6xl">
        {FESTIVAL.title}
      </h1>
      <p className="rise-in-3 mt-4 max-w-sm text-base leading-relaxed text-muted">
        写一封只给一个人看的月亮。选一句合适的话，署名，然后寄出去。
      </p>

      <div className="rise-in-4 mt-8 flex w-full max-w-sm flex-col gap-2 sm:flex-row lg:max-w-none">
        <Button variant="primary" size="lg" className="flex-1" onClick={onWrite}>
          写月笺
          <ArrowDown className="size-4" strokeWidth={1.75} />
        </Button>
        <Button variant="outline" size="lg" className="flex-1" onClick={onLantern}>
          放一盏灯
        </Button>
      </div>
    </section>
  );
}
