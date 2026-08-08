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
});
