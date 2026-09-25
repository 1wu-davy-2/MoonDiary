import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, ShieldAlert } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adminLoginFn, adminLogoutFn, adminSessionFn } from "@/lib/admin.fns";

export const Route = createFileRoute("/admin")({
  loader: () => adminSessionFn(),
  head: () => ({
    meta: [
      { title: "管理后台 · 月笺" },
      // The dashboard lists every letter's text and every visitor's IP; it has
      // no business in a search index.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

/**
 * Gate for every `/admin` page.
 *
 * The loader resolves the session server-side from the httpOnly cookie. When
 * there is none, the login form replaces the outlet entirely — child routes
 * never render, so nothing sensitive reaches the browser.
 */
function AdminLayout() {
  const { user, usingDefaultPassword } = Route.useLoaderData();
  if (!user) return <AdminLogin />;
  return <AdminShell user={user} usingDefaultPassword={usingDefaultPassword} />;
}

function AdminShell({
  user,
  usingDefaultPassword,
}: {
  user: string;
  usingDefaultPassword: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    setBusy(true);
    try {
      await adminLogoutFn();
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-sm tracking-brand text-fg">月笺</span>
            <span className="text-xs text-muted">管理后台</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">{user}</span>
            <Button
              variant="ghost"
              size="default"
              onClick={onLogout}
              disabled={busy}
            >
              <LogOut className="size-4" strokeWidth={1.75} />
              退出登录
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">
        {usingDefaultPassword ? <DefaultPasswordWarning /> : null}
        <Outlet />
      </main>

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

/** The single most useful thing this page can say. */
function DefaultPasswordWarning() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-[0_0_0_1px_rgba(232,213,176,0.25)]">
      <span className="mt-0.5 text-accent" aria-hidden="true">
        <ShieldAlert className="size-5" strokeWidth={1.75} />
      </span>
      <div className="text-sm leading-relaxed">
        <p className="text-fg">后台还在用默认密码</p>
        <p className="mt-1 text-muted">
          默认账号 <code className="text-accent">admin / admin@123</code>{" "}
          是公开的，任何人都能登录看到所有月笺和访问 IP。请改掉 docker-compose
          里 <code className="text-accent">ADMIN_PASSWORD</code> 后重启容器。
        </p>
      </div>
    </div>
  );
}

function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await adminLoginFn({ data: { username, password } });
      if (result.ok) {
        await router.invalidate();
        return;
      }
      toast(
        result.reason === "throttled"
          ? "尝试次数过多，请过一会儿再试"
          : "用户名或密码不对",
      );
    } catch {
      toast("登录失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-5 text-fg">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-[var(--shadow-border)]"
      >
        <p className="text-xs tracking-hero text-muted">月笺</p>
        <h1 className="mt-3 font-display text-2xl font-medium">管理后台</h1>

        <label className="mt-8 block text-xs tracking-label text-muted" htmlFor="admin-user">
          账号
        </label>
        <input
          id="admin-user"
          className="field mt-1"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />

        <label className="mt-6 block text-xs tracking-label text-muted" htmlFor="admin-pass">
          密码
        </label>
        <input
          id="admin-pass"
          type="password"
          className="field mt-1"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-8 w-full"
          disabled={busy}
        >
          {busy ? "登录中" : "登录"}
        </Button>
      </form>

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
