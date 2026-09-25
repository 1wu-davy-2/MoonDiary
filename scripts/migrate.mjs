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
  process.exit(1);
});
