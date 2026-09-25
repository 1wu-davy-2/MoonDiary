import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { LetterCard } from "@/components/letter-card";
import { adminLetterDetailFn } from "@/lib/admin.fns";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/admin/letters/$id")({
  loader: async ({ params }) => {
    const detail = await adminLetterDetailFn({ data: { id: params.id } });
    // `null` covers both "no such letter" and "session lapsed". Only the first
    // should 404 — but the layout is already rendering the login form for the
    // second, so the distinction does not reach the user either way.
    if (!detail) throw notFound();
    return detail;
  },
  component: AdminLetterDetail,
  notFoundComponent: LetterGone,
});

function AdminLetterDetail() {
  const letter = Route.useLoaderData();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin"
          search={{ page: 1, q: "" }}
          className="inline-flex items-center gap-2 text-sm text-muted transition-colors duration-150 ease-out hover:text-fg"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
          返回列表
        </Link>
        <a
          href={`/l/${letter.id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
        >
          打开分享页
          <ExternalLink className="size-3.5" strokeWidth={1.75} />
        </a>
      </div>

      <section className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <LetterCard
          letter={{
            to: letter.to,
            from: letter.from,
            tone: letter.tone,
            message: letter.message,
          }}
          dateText={formatDateTime(letter.createdAt)}
        />

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-surface p-5 shadow-[var(--shadow-border)]">
            <h2 className="text-xs tracking-label text-muted">创建信息</h2>
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <Row label="分享码" value={letter.id} mono />
              <Row label="创建时间" value={formatDateTime(letter.createdAt)} />
              <Row label="创建 IP" value={letter.createdIp} mono />
              <Row label="语气" value={letter.tone} mono />
              <Row label="打开次数" value={`${letter.views} 次`} />
              <Row label="User-Agent" value={letter.createdUa ?? "—"} small />
            </dl>
          </div>

          <div className="rounded-2xl bg-surface p-5 shadow-[var(--shadow-border)]">
            <h2 className="text-xs tracking-label text-muted">
              访问记录（{letter.viewRows.length}）
            </h2>
            {letter.viewRows.length === 0 ? (
              <p className="mt-4 text-sm text-muted">还没有人打开过。</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {letter.viewRows.map((view) => (
                  <li key={view.id} className="text-xs">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-fg">{view.ip}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {formatDateTime(view.createdAt)}
                      </span>
                    </div>
                    {view.referer ? (
                      <p className="mt-1 truncate text-muted">来源 {view.referer}</p>
                    ) : null}
                    {view.userAgent ? (
                      <p className="mt-0.5 line-clamp-2 text-muted/80">
                        {view.userAgent}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd
        className={[
          "min-w-0 break-words text-right text-fg",
          mono ? "font-mono text-xs" : "",
          small ? "text-xs text-muted" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function LetterGone() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <h1 className="font-display text-xl font-medium">没有这封月笺</h1>
      <p className="text-sm text-muted">它可能已经被删掉了。</p>
      <Link to="/admin" search={{ page: 1, q: "" }} className="text-sm text-accent hover:underline">
        返回列表
      </Link>
    </div>
  );
}
