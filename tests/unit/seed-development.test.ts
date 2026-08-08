import { describe, expect, it } from "vitest";

import {
  seedDevelopment,
  type DevelopmentSeedRepository,
  type DevelopmentSeedTransaction
} from "../../src/modules/developer-platform/application/seed-development.js";

const input = {
  environment: "development",
  issuerBaseUrl: "http://localhost:8080",
  hashKey: "test-api-key-hashing-secret-value"
};

const createRepository = (seedExists = false): DevelopmentSeedRepository => {
  const transaction: DevelopmentSeedTransaction = {
    hasExistingDevelopmentSeed: async () => seedExists,
    createOrganization: async () => "organization-1",
    createProject: async () => "project-1",
    createEnvironment: async () => "environment-1",
    createSecretKey: async () => undefined,
    appendSeedAuditEvent: async () => undefined
  };
  return { transaction: async (operation) => operation(transaction) };
};

describe("seedDevelopment", () => {
  it("creates a local bootstrap credential only in development", async () => {
    const result = await seedDevelopment(createRepository(), input);

    expect(result).toMatchObject({ organizationId: "organization-1", projectId: "project-1" });
    expect(result.secretApiKey).toMatch(/^sk_[A-Za-z0-9_-]{43}$/);
  });

  it("rejects non-development environments and duplicate bootstrap seeds", async () => {
    await expect(seedDevelopment(createRepository(), { ...input, environment: "production" })).rejects.toThrow(
      "NODE_ENV=development"
    );
    await expect(seedDevelopment(createRepository(true), input)).rejects.toThrow("never revealed again");
  });
});
