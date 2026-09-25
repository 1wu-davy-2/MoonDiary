import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { isMigrationFile, migrationName, pendingMigrations } from "./migration-plan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("_migrations keys on basename, not path", () => {
  assert.equal(migrationName("/migrations/0002_letters.sql"), "0002_letters.sql");
  assert.equal(migrationName("migrations/archive/0001_old.sql"), "0001_old.sql");
  assert.equal(migrationName("0001_letters.sql"), "0001_letters.sql");
});

test("a Windows-style path still yields a bare basename", () => {
  // `readdir` hands back bare names, but a path built with `join` on Windows
  // would otherwise keep its directories and miss the `_migrations` key.
  assert.equal(migrationName("migrations\\0001_letters.sql"), "0001_letters.sql");
});

test("a file already applied does not re-apply", () => {
  assert.deepEqual(pendingMigrations(["/migrations/0001_letters.sql"], ["0001_letters.sql"]), []);
});

test("pending migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("non-.sql entries are dropped", () => {
  assert.equal(isMigrationFile("README.md"), false);
  assert.equal(isMigrationFile("0001_letters.sql"), true);
  assert.deepEqual(pendingMigrations(["README.md", "notes.txt"], []), []);
});

test("every migration in this project is discovered", () => {
  const discovered = pendingMigrations(readdirSync(join(root, "migrations")), []);
  assert.ok(
    discovered.some(({ name }) => name === "0001_letters.sql"),
    "migrations/0001_letters.sql should be picked up",
  );
});
