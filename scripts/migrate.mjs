#!/usr/bin/env node
/**
 * Database migrator (MariaDB / MySQL, `mysql2`).
 *
 * Runs at container start — see `docker/entrypoint.sh` — so the schema is in
 * place before the server takes traffic. Applying is tracked in `_migrations`,
 * so re-running is a no-op.
 *
 * A note on transactions: MariaDB commits implicitly on DDL, so wrapping a
 * `.sql` file in BEGIN/COMMIT would buy nothing but false confidence. Files are
 * therefore applied statement-batch first, recorded after. A file that fails
 * halfway is NOT recorded, so it re-runs on the next start — which is why
 * migrations here use `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`
 * and are written to be safely repeatable.
 *
 *   node scripts/migrate.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";
import { pendingMigrations } from "./migration-plan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "migrations");

/**
 * Pick up `.env` so `npm run db:migrate` works locally without exporting
 * everything by hand. In the container there is no `.env` (compose passes real
 * environment variables), so a missing file is expected and ignored —
 * `loadEnvFile` does not overwrite variables that are already set.
 */
try {
  process.loadEnvFile(join(root, ".env"));
} catch {
  /* no .env — running from the container environment */
}

function connectionOptions() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return { uri: url };
  return {
    host: process.env.DB_HOST?.trim() || "127.0.0.1",
    port: Number(process.env.DB_PORT?.trim() || 3306),
    user: process.env.DB_USER?.trim() || "yuejian",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME?.trim() || "yuejian",
  };
}

/** mysql2 wants `uri` spread as `{ uri }`, discrete fields spread directly. */
function toConnectionConfig(options) {
  return "uri" in options
    ? { uri: options.uri }
    : {
        host: options.host,
        port: options.port,
        user: options.user,
        password: options.password,
        database: options.database,
      };
}

/**
 * 退出码约定 —— docker/entrypoint.sh 靠它决定要不要重试（那边是硬编码的
 * 同名常量，改这里记得同步）：
 *   0  成功
 *   1  暂时性失败（数据库还没起来），值得重试
 *   2  永久性失败（密码错、库不存在、SQL 写错），重试多少次都一样
 */
const EXIT_TRANSIENT = 1;
const EXIT_PERMANENT = 2;

/**
 * 连不上的错误 —— 数据库容器还在启动中，等一会儿就好。
 *
 * 判断依据是"**有没有连上**"：只要 TCP 层没通，就是暂时性的；
 * 一旦连上了服务器还报错，那就是账号、库名或 SQL 的问题，
 * 永远不会自己好，必须立刻停下并说清楚。
 */
const TRANSIENT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "PROTOCOL_CONNECTION_LOST",
  "ER_CON_COUNT_ERROR",
]);

function isTransient(error) {
  return TRANSIENT_CODES.has(error?.code);
}

async function main() {
  let entries;
  try {
    entries = await readdir(migrationsDir);
  } catch {
    console.log("[migrate] no migrations/ directory — nothing to do.");
    return;
  }
  if (pendingMigrations(entries, []).length === 0) {
    console.log("[migrate] no migrations — nothing to do.");
    return;
  }

  const options = connectionOptions();

  // 把目标打出来（不含密码）—— 连不上时第一眼就能看出连的是哪儿。
  const target =
    "uri" in options
      ? "[来自 DATABASE_URL]"
      : `${options.host}:${options.port}/${options.database} 用户=${options.user}`;
  console.log(`[migrate] 连接 ${target}`);
  const connection = await mysql.createConnection({
    ...toConnectionConfig(options),
    // Named collation, not a bare "utf8mb4" (which resolves to
    // utf8mb4_general_ci) — keep it identical to the tables and to @/lib/db.
    charset: "utf8mb4_unicode_ci",
    // A whole .sql file is sent in one round trip.
    multipleStatements: true,
  });

  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name       VARCHAR(255) NOT NULL,
         applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (name)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    const [rows] = await connection.query("SELECT name FROM _migrations");
    const applied = rows.map((row) => row.name);

    let count = 0;
    for (const { name } of pendingMigrations(entries, applied)) {
      const sql = await readFile(join(migrationsDir, name), "utf8");
      try {
        await connection.query(sql);
      } catch (err) {
        console.error(`[migrate] failed applying ${name}`);
        throw err;
      }
      await connection.query("INSERT INTO _migrations (name) VALUES (?)", [name]);
      console.log(`[migrate] applied ${name}`);
      count += 1;
    }
    console.log(
      count ? `[migrate] done — ${count} migration(s) applied.` : "[migrate] up to date.",
    );
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err?.message || err);
  // mysql2 errors carry the context needed to debug a bad SQL file.
  for (const key of ["code", "errno", "sqlState", "sqlMessage"]) {
    if (err?.[key] != null) console.error(`[migrate]   ${key}: ${err[key]}`);
  }

  // 连都没连上 —— 数据库多半还在启动，交给 entrypoint 重试。
  if (isTransient(err)) process.exit(EXIT_TRANSIENT);

  // 连上了还报错，说明是账号/库名/SQL 的问题，不会自己好。
  // 把"接下来该干什么"直接打出来，省得对着 Access denied 猜。
  if (err?.code === "ER_ACCESS_DENIED_ERROR" || err?.code === "ER_DBACCESS_DENIED_ERROR") {
    console.error("");
    console.error("[migrate] 账号或密码不对。");
    console.error("[migrate] MariaDB 只在数据目录为空时初始化，之后再改 .env");
    console.error("[migrate] 也不会动已有用户的密码 —— 库里存的还是首次启动那套。");
    console.error("[migrate]");
    console.error("[migrate] 库里没有有效数据 → 清库重来（会清空所有数据）：");
    console.error("[migrate]     docker compose down -v && docker compose up -d");
    console.error("[migrate]");
    console.error("[migrate] 库里已有数据 → 进容器把密码改成 .env 里那个：");
    console.error("[migrate]     docker compose exec mariadb mariadb -uroot -p'旧的root密码'");
    console.error("[migrate]     > ALTER USER 'yuejian'@'%' IDENTIFIED BY '新密码';");
    console.error("[migrate]     > FLUSH PRIVILEGES;");
  }
  if (err?.code === "ER_BAD_DB_ERROR") {
    console.error("");
    console.error("[migrate] 数据库不存在 —— 检查 .env 的 DB_NAME 和");
    console.error("[migrate] compose 里 mariadb 的 MARIADB_DATABASE 是否一致。");
  }

  process.exit(EXIT_PERMANENT);
});
