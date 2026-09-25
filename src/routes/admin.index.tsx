import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminLettersFn, adminStatsFn } from "@/lib/admin.fns";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/admin/")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Math.max(1, Math.trunc(Number(search.page)) || 1),
    q: typeof search.q === "string" ? search.q.slice(0, 64) : "",
  }),
  loaderDeps: ({ search: { page, q } }) => ({ page, q }),
  loader: async ({ deps }) => {
    const [stats, letters] = await Promise.all([
      adminStatsFn(),
      adminLettersFn({ data: { page: deps.page, search: deps.q } }),
    ]);
    return { stats, letters };
  },
  component: AdminDashboard,
});

function AdminDashboard() {
  const { stats, letters } = Route.useLoaderData();

  // Both are null when the session lapsed between the layout's check and this
  // loader — the layout is already showing the login form, so render nothing.
  if (!stats || !letters) return null;

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="月笺总数" value={stats.letterCount} />
        <Stat label="打开次数" value={stats.viewCount} />
        <Stat label="今日新建" value={stats.todayCount} />
        <Stat label="独立访客" value={stats.uniqueVisitors} />
      </section>

      <SearchBar />

      <section className="rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        {letters.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            还没有月笺。
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {letters.rows.map((row) => (
              <li key={row.id}>
                <Link
                  to="/admin/letters/$id"
                  params={{ id: row.id }}
                  className="flex flex-col gap-2 px-5 py-4 transition-colors duration-150 ease-out hover:bg-bg/40 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span className="font-mono text-xs text-accent">{row.id}</span>
                      <span className="truncate text-sm text-fg">
                        写给 {row.to || "月亮"}
                      </span>
                      {row.from ? (
                        <span className="shrink-0 text-xs text-muted">
                          · {row.from}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs text-muted">{row.message}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs text-muted">
                    <span className="font-mono">{row.createdIp}</span>
                    <span className="tabular-nums">{row.views} 次</span>
                    <span className="tabular-nums">{formatDateTime(row.createdAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {letters.pageCount > 1 ? (
        <Pagination page={letters.page} pageCount={letters.pageCount} total={letters.total} />
      ) : (
        <p className="text-center text-xs text-muted">共 {letters.total} 条</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
      <p className="text-xs tracking-label text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-medium tabular-nums text-fg">
        {value}
      </p>
    </div>
  );
}

function SearchBar() {
  const navigate = useNavigate();
  const { q } = Route.useSearch();
  // Seeded from the URL so the box still shows the active filter after a
  // reload or a back-navigation.
  const [value, setValue] = useState(q);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Changing the search resets to page 1 — staying on page 7 of a narrower
    // result set would just show an empty list.
    void navigate({ to: "/admin", search: { q: value.trim(), page: 1 } });
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          strokeWidth={1.75}
        />
        <input
          className="field pl-9"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="搜分享码或写给谁"
          aria-label="搜索月笺"
        />
      </div>
      <Button type="submit" variant="outline" size="default">
        搜索
      </Button>
    </form>
  );
}

function Pagination({
  page,
  pageCount,
  total,
}: {
  page: number;
  pageCount: number;
  total: number;
}) {
  const navigate = useNavigate();
  const { q } = Route.useSearch();

  function go(next: number) {
    void navigate({ to: "/admin", search: { q, page: next } });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        variant="outline"
        size="default"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
      >
        上一页
      </Button>
      <p className="text-xs tabular-nums text-muted">
        第 {page} / {pageCount} 页 · 共 {total} 条
      </p>
      <Button
        variant="outline"
        size="default"
        onClick={() => go(page + 1)}
        disabled={page >= pageCount}
      >
        下一页
      </Button>
    </div>
  );
}
