import { describe, expect, it, vi } from "vitest";

import { listProjects, type ProjectListReader } from "../../src/modules/developer-platform/application/list-projects.js";

describe("listProjects", () => {
  it("passes the trusted project scope and cursor directly to its query reader", async () => {
    const reader: ProjectListReader = {
      listProjects: vi.fn(async () => ({ data: [], nextCursor: undefined }))
    };
    const input = {
      authenticatedProjectId: "6b1617e4-9a45-4cc9-869e-d9d7d9d3e401",
      cursor: "59a8b9e4-455a-4af8-a879-47c03b49d7cb",
      limit: 10
    };

    await expect(listProjects(reader, input)).resolves.toEqual({ data: [], nextCursor: undefined });
    expect(reader.listProjects).toHaveBeenCalledWith(input);
  });
});
