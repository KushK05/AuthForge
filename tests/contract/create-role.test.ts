import { describe, expect, it } from "vitest";

import { buildApi, type AuthorizationDependencies, type DeveloperPlatformDependencies } from "../../src/api/app.js";
import type { SecretApiKeyReader } from "../../src/modules/developer-platform/application/authenticate-secret-key.js";
import type { DeveloperPlatformRepository } from "../../src/modules/developer-platform/application/create-project.js";
import type { RoleCreationRepository, RoleCreationTransaction } from "../../src/modules/authorization/application/create-role.js";
import type { AppConfig } from "../../src/platform/config.js";

const config: AppConfig = {
  environment: "test", host: "127.0.0.1", port: 0, logLevel: "error",
  databaseUrl: "postgres://authforge:authforge@localhost:5432/authforge", redisUrl: "redis://localhost:6379",
  awsRegion: "us-east-1", apiKeyHashKey: "test-api-key-hashing-secret-value",
  tokenDerivationKey: "test-token-derivation-key-with-32-bytes", publicIssuerBaseUrl: "http://localhost:8080",
  passwordMinLength: 12, argon2: { memoryKiB: 19_456, iterations: 2, parallelism: 1 }
};

const transaction: RoleCreationTransaction = {
  lockIdempotencyScope: async () => undefined,
  findIdempotencyRecord: async () => undefined,
  findKnownPermissions: async (codes) => codes,
  createRole: async () => ({ id: "role-1", name: "Reader", description: undefined, permissions: ["profile:read"] }),
  appendAuditEvent: async () => undefined,
  appendOutboxEvent: async () => undefined,
  saveIdempotencyRecord: async () => undefined
};
const authorization: AuthorizationDependencies = {
  roleCreationRepository: { transaction: async (operation) => operation(transaction) } satisfies RoleCreationRepository
};
const developerPlatform: DeveloperPlatformDependencies = {
  repository: {
    findActiveSecretApiKey: async () => ({ id: "key-1", projectId: "7b1617e4-9a45-4cc9-869e-d9d7d9d3e401", scopes: ["roles:write"] })
  } as unknown as DeveloperPlatformRepository & SecretApiKeyReader
};

describe("POST /v1/developer/projects/:projectId/roles", () => {
  it("creates a role only for the project authenticated by the API key", async () => {
    const api = buildApi(config, undefined, developerPlatform, undefined, authorization);
    const response = await api.inject({
      method: "POST",
      url: "/v1/developer/projects/7b1617e4-9a45-4cc9-869e-d9d7d9d3e401/roles",
      headers: { authorization: `Bearer sk_${"a".repeat(43)}`, "idempotency-key": "role-create-001" },
      payload: { name: "Reader", permissions: ["profile:read"] }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: "role-1", name: "Reader", permissions: ["profile:read"] });
    await api.close();
  });
});
