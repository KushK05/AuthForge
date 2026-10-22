import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readMigrations } from "../../src/platform/database/migrate.js";

describe("readMigrations", () => {
  it("returns only ordered SQL migrations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "authforge-migrations-"));
    await writeFile(join(directory, "0002_second.sql"), "SELECT 2;");
    await writeFile(join(directory, "0001_first.sql"), "SELECT 1;");
    await writeFile(join(directory, "notes.txt"), "not a migration");

    await expect(readMigrations(directory)).resolves.toEqual([
      { id: "0001_first", sql: "SELECT 1;" },
      { id: "0002_second", sql: "SELECT 2;" }
    ]);
  });

  it("loads repository migrations and includes showcase_console_sessions and showcase_api_keys", async () => {
    const migrations = await readMigrations();
    expect(migrations.length).toBeGreaterThanOrEqual(9);

    const showcaseCore = migrations.find((m) => m.id === "0008_showcase_core");
    expect(showcaseCore).toBeDefined();
    expect(showcaseCore?.sql).toContain("CREATE TABLE showcase_console_sessions");
    expect(showcaseCore?.sql).toContain("CREATE TABLE showcase_api_keys");
    expect(showcaseCore?.sql).toContain("showcase_console_sessions_active_idx");
    expect(showcaseCore?.sql).toContain("showcase_api_keys_active_idx");
  });
});
