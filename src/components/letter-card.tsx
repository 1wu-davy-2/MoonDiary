import { FESTIVAL, type Letter } from "@/lib/blessings";
import { cn } from "@/lib/utils";

/**
 * The letter as it is meant to be read — the studio preview and the public
 * share page render the exact same component, so what the sender previews is
 * what the recipient opens.
 */
export function LetterCard({
  letter,
  dateText = FESTIVAL.gregorian,
  className,
}: {
  letter: Letter;
  dateText?: string;
  className?: string;
}) {
  const to = letter.to.trim() || "月亮";
  const from = letter.from.trim() || "无名";
  const message = letter.message.trim() || "今晚月圆，把想说的写在这里。";

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-3xl bg-surface p-6 shadow-[var(--shadow-border)]",
        className,
      )}
    >
      <img
        src="/osmanthus.jpg"
        alt=""
        className="osmanthus pointer-events-none absolute -right-8 bottom-0 h-56 w-auto opacity-40"
      />
      <div className="relative flex flex-col items-center text-center">
        <p className="text-xs tracking-hero text-muted">月笺</p>
        <div className="mt-6 size-28 overflow-hidden rounded-full shadow-[var(--shadow-border)]">
          <img
            src="/moon.jpg"
            alt=""
            className="size-full object-cover outline outline-1 -outline-offset-1 outline-fg/15"
          />
        </div>
        <p className="mt-6 text-xs tracking-label text-muted">写给</p>
        <p className="mt-2 font-display text-2xl font-medium text-fg">{to}</p>
        <span className="mt-4 block h-px w-10 bg-accent/40" />
        <p className="mt-5 max-w-sm text-base leading-relaxed text-accent">{message}</p>
        <p className="mt-8 text-sm text-fg">{from}</p>
        <p className="mt-2 text-xs tracking-label text-muted">{dateText}</p>
      </div>
    </article>
  );
}
