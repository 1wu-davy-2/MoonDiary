import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "出了点问题，刷新页面再试试。";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

/**
 * Router-level error boundary. Keeps `error.message` visible on purpose — a
 * blank screen tells whoever is debugging nothing at all.
 */
export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-fg">
      <span className="text-accent" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={1.5} />
      </span>
      <h1 className="font-display text-xl font-medium">出了点问题</h1>
      <p className="max-w-md text-sm leading-relaxed break-words text-muted">
        {errorMessage(error)}
      </p>
    </main>
  );
}
