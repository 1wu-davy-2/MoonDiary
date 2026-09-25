import mysql from "mysql2/promise";
import { env, envOr } from "./env.server";

/**
 * MariaDB access, server-only.
 *
 * Connection comes from `DATABASE_URL` when set (a single value is easier to
 * inject in compose), otherwise from the discrete `DB_*` vars. Schema lives in
 * `migrations/*.sql` and is applied by `scripts/migrate.mjs` at container start
 * — never create tables inline here.
 */

/** Stored/returned as UTC strings; see `dateStrings` below. */
export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

function readConfig(): DbConfig | { uri: string } {
  const url = env("DATABASE_URL");
  if (url) return { uri: url };
  return {
    host: envOr("DB_HOST", "127.0.0.1"),
    port: Number(envOr("DB_PORT", "3306")),
    user: envOr("DB_USER", "yuejian"),
    password: env("DB_PASSWORD") ?? "",
    database: envOr("DB_NAME", "yuejian"),
  };
}

/**
 * Init state lives on globalThis: dev HMR creates new module instances, and two
 * of them racing module-level state would open a second pool.
 */
const globalRef = globalThis as typeof globalThis & {
  __yuejianPool__?: mysql.Pool;
};

function createPool(): mysql.Pool {
  const config = readConfig();
  const shared = {
    waitForConnections: true,
    connectionLimit: Number(envOr("DB_POOL_SIZE", "10")),
    queueLimit: 0,
    // Chinese text is the whole point of this app — utf8mb4 end to end. Naming
    // the collation explicitly matters: a bare "utf8mb4" resolves to
    // utf8mb4_general_ci, which differs from the tables' utf8mb4_unicode_ci and
    // would force a conversion on every comparison.
    charset: "utf8mb4_unicode_ci",
    // Return TIMESTAMP/DATETIME as 'YYYY-MM-DD HH:MM:SS' strings rather than
    // JS Dates, so `@/lib/format` can parse them deliberately instead of the
    // driver reinterpreting them through the process timezone.
    dateStrings: true,
    enableKeepAlive: true,
  } as const;

  const pool =
    "uri" in config
      ? mysql.createPool({ uri: config.uri, ...shared })
      : mysql.createPool({ ...config, ...shared });

  // Pin the *session* time zone to UTC.
  //
  // This is not redundant with any driver option: on the `dateStrings` path
  // mysql2 returns the string the server produced without converting it, so the
  // session's time zone is what actually stamps the value. A server running at
  // +08:00 would hand back local time that `@/lib/format` then reads as UTC —
  // every timestamp off by eight hours, and dates flipping for anything before
  // 08:00. Setting it here means the app is correct regardless of how the
  // database happens to be configured.
  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });

  return pool;
}

/** The shared pool. Throws in the browser — this module is server-only. */
export function getPool(): mysql.Pool {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call it from a route loader, a server route " +
        "handler, or a createServerFn, never from client code.",
    );
  }
  globalRef.__yuejianPool__ ??= createPool();
  return globalRef.__yuejianPool__;
}

/**
 * Run a parameterized query. Always pass values as `params` — never build SQL
 * by concatenating input.
 *
 * `T` is the caller's row shape and is not checked against the schema — the
 * cast is where that trust is placed, so keep the shape next to the SELECT that
 * produces it.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await getPool().execute(sql, asExecuteValues(params));
  return rows as T[];
}

/** Run a parameterized statement and return the affected-row count. */
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  const [result] = await getPool().execute<mysql.ResultSetHeader>(
    sql,
    asExecuteValues(params),
  );
  return result.affectedRows;
}

/**
 * `execute` takes `ExecuteValues` (the scalar types the binary protocol can
 * bind), while callers here pass `unknown[]` — the honest signature, since a
 * caller genuinely does not know what a value is. mysql2 rejects a value it
 * cannot bind at runtime, so this cast moves no safety, it only stops the
 * compiler from demanding every caller re-narrow.
 */
function asExecuteValues(params: unknown[]): Parameters<mysql.Pool["execute"]>[1] {
  return params as Parameters<mysql.Pool["execute"]>[1];
}

/** True when the database answers. Used by the compose healthcheck. */
export async function ping(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
