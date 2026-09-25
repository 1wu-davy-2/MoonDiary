import { getRequestUrl } from "@tanstack/react-start/server";
import { publicBaseUrl } from "@/lib/env.server";

/**
 * Absolute origin to build share links from.
 *
 * `PUBLIC_BASE_URL` wins when set. Otherwise the incoming request's own URL is
 * used, honouring `X-Forwarded-Host` / `X-Forwarded-Proto` — behind the
 * operator's nginx the app itself sees plain HTTP on an internal port, so
 * without those headers every generated link would come out as
 * `http://<container>:3000/l/...` and be useless to a recipient.
 */
export function requestBaseUrl(): string {
  const configured = publicBaseUrl();
  if (configured) return configured;
  const url = getRequestUrl({ xForwardedHost: true, xForwardedProto: true });
  return url.origin;
}
