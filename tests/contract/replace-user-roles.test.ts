import { describe, expect, it } from "vitest";

import {
  buildApi,
  type AuthorizationDependencies,
  type DeveloperPlatformDependencies,
  type IdentityDependencies
} from "../../src/api/app.js";
import type { SecretApiKeyReader } from "../../src/modules/developer-platform/application/authenticate-secret-key.js";
import type { DeveloperPlatformRepository } from "../../src/modules/developer-platform/application/create-project.js";
import type { UserRoleAssignmentRepository, UserRoleAssignmentTransaction } from "../../src/modules/authorization/application/replace-user-roles.js";
import type { AppConfig } from "../../src/platform/config.js";

const config: AppConfig = {
  environment: "test", host: "127.0.0.1", port: 0, logLevel: "error",
  databaseUrl: "postgres://authforge:authforge@localhost:5432/authforge", redisUrl: "redis://localhost:6379",
  awsRegion: "us-east-1", apiKeyHashKey: "test-api-key-hashing-secret-value",
  tokenDerivationKey: "test-token-derivation-key-with-32-bytes", publicIssuerBaseUrl: "http://localhost:8080",
  passwordMinLength: 12, argon2: { memoryKiB: 19_456, iterations: 2, parallelism: 1 }
};
const projectId = "7b1617e4-9a45-4cc9-869e-d9d7d9d3e401";
const userId = "8b1617e4-9a45-4cc9-869e-d9d7d9d3e401";
const roleId = "9b1617e4-9a45-4cc9-869e-d9d7d9d3e401";

const transaction: UserRoleAssignmentTransaction = {
  lockIdempotencyScope: async () => undefined,
  findIdempotencyRecord: async () => undefined,
  findRoleIds: async (input) => input.roleIds,
  replaceUserRoles: async () => undefined,
  appendAuditEvent: async () => undefined,
  appendOutboxEvent: async () => undefined,
  saveIdempotencyRecord: async () => undefined
};
const authorization: AuthorizationDependencies = {
  roleCreationRepository: {} as AuthorizationDependencies["roleCreationRepository"],
  userRoleAssignmentRepository: { transaction: async (operation) => operation(transaction) } satisfies UserRoleAssignmentRepository
};
const identity: IdentityDependencies = {
  signUpRepository: {} as IdentityDependencies["signUpRepository"],
  emailVerificationRepository: {} as IdentityDependencies["emailVerificationRepository"],
  userReader: { findUserInProject: async () => true }
};
const developerPlatform: DeveloperPlatformDependencies = {
  repository: {
    findActiveSecretApiKey: async () => ({ id: "key-1", projectId, scopes: ["roles:write"] })
  } as unknown as DeveloperPlatformRepository & SecretApiKeyReader
};

describe("PUT /v1/developer/projects/:projectId/users/:userId/roles", () => {
  it("returns the replaced role IDs", async () => {
    const api = buildApi(config, undefined, developerPlatform, identity, authorization);
    const response = await api.inject({
      method: "PUT",
      url: `/v1/developer/projects/${projectId}/users/${userId}/roles`,
      headers: { authorization: `Bearer sk_${"a".repeat(43)}`, "idempotency-key": "role-assignment-001" },
      payload: { role_ids: [roleId] }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ role_ids: [roleId] });
    await api.close();
  });
});
