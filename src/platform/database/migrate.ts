import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import postgres from "postgres";

import { loadConfig, loadLocalEnvironmentFile } from "../config.js";
import { Logger } from "../logger.js";

export type Migration = Readonly<{
  id: string;
  sql: string;
}>;

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const filenamePattern = /^(\d{4}_[a-z0-9_]+)\.sql$/;

export const readMigrations = async (directory = migrationsDirectory): Promise<readonly Migration[]> => {
  const filenames = await readdir(directory);
  const migrationFilenames = filenames.filter((filename) => filenamePattern.test(filename)).sort();
  const ids = migrationFilenames.map((filename) => filename.replace(/\.sql$/, ""));

  if (new Set(ids).size !== ids.length) {
    throw new Error("Migration identifiers must be unique");
  }

  return Promise.all(
    migrationFilenames.map(async (filename) => ({
      id: filename.replace(/\.sql$/, ""),
      sql: await readFile(join(directory, filename), "utf8")
    }))
  );
};

const ensureMigrationTable = async (sql: postgres.Sql): Promise<void> => {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
};

const applyMigration = async (sql: postgres.Sql, migration: Migration): Promise<boolean> => {
  return sql.begin(async (transaction) => {
    const [existing] = await transaction<{ id: string }[]>`
      SELECT id FROM schema_migrations WHERE id = ${migration.id}
    `;
    if (existing) return false;

    await transaction.unsafe(migration.sql);
    await transaction`
      INSERT INTO schema_migrations (id) VALUES (${migration.id})
    `;
    return true;
  });
};

export const migrate = async (): Promise<void> => {
  loadLocalEnvironmentFile();
  const config = loadConfig();
  const logger = new Logger(config.logLevel, config.environment);
  const sql = postgres(config.databaseUrl, { max: 1 });

  try {
    await sql`SELECT pg_advisory_lock(824_031_420)`;
    await ensureMigrationTable(sql);

    for (const migration of await readMigrations()) {
      if (await applyMigration(sql, migration)) {
        logger.info("Migration applied", { migration_id: migration.id });
      }
    }
  } finally {
    await sql`SELECT pg_advisory_unlock(824_031_420)`;
    await sql.end({ timeout: 5 });
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void migrate().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        message: "Migration failed",
        error_name: error instanceof Error ? error.name : "UnknownError"
      })}\n`
    );
    process.exitCode = 1;
  });
}
