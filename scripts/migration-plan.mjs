// @ts-check
/**
 * Migration bookkeeping for `scripts/migrate.mjs`.
 *
 * Applied files are keyed by BASENAME, so a file is applied once regardless of
 * how it was discovered. Discovery is non-recursive: only `migrations/*.sql`
 * counts, subdirectories are ignored.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 *
 * Splits on both separators: discovery normally yields bare names from
 * `readdir`, but a Windows-style path would otherwise keep its directories.
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}
