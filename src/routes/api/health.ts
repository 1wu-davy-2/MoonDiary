import { createFileRoute } from "@tanstack/react-router";
import { clientIp } from "@/lib/server/request-ip";

/**
 * Liveness probe for the compose healthcheck. Deliberately does not touch the
 * database: it answers "is the process serving traffic", not "is MariaDB up" —
 * a DB blip should not make Docker restart a perfectly healthy container.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          ip: clientIp(),
          time: new Date().toISOString(),
        });
      },
    },
  },
});
