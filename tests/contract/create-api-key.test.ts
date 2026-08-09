import { describe, expect, it, vi } from "vitest";

import { buildApi } from "../../src/api/app.js";
import type { SecretApiKeyReader } from "../../src/modules/developer-platform/application/authenticate-secret-key.js";
import type {
  ApiKeyCreationRepository,
  ApiKeyCreationTransaction,
  ApiKeySummary
} from "../../src/modules/developer-platform/application/create-api-key.js";
import type { DeveloperPlatformRepository } from "../../src/modules/developer-platform/application/create-project.js";
import type {
  ApiKeyRevocationRepository,
  ApiKeyRevocationTransaction
} from "../../src/modules/developer-platform/application/revoke-api-key.js";
import type { AppConfig } from "../../src/platform/config.js";

const config: AppConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 0,
  logLevel: "error",
  databaseUrl: "postgres://authforge:authforge@localhost:5432/authforge",
  redisUrl: "redis://localhost:6379",
  awsRegion: "us-east-1",
  apiKeyHashKey: "test-api-key-hashing-secret-value",
  publicIssuerBaseUrl: "http://localhost:8080"
};

const key: ApiKeySummary = {
  id: "key-2",
  kind: "publishable",
  prefix: "pk_abcdefgh",
  scopes: [],
  expiresAt: undefined
};

const createApi = () => {
  let replay: Readonly<{ requestHash: Buffer; key: ApiKeySummary }> | undefined;
  const createKey = vi.fn(async () => key);
  const keyTransaction: ApiKeyCreationTransaction = {
    lockIdempotencyScope: async () => undefined,
    findIdempotencyRecord: async () => replay,
    findDefaultEnvironmentInOrganization: async () => ({ projectId: "project-2", environmentId: "environment-2" }),
    createApiKey: createKey,
    appendAuditEvent: async () => undefined,
    saveIdempotencyRecord: async (input) => {
      replay = { requestHash: input.requestHash, key: input.response };
    }
  };
  const repository: DeveloperPlatformRepository & SecretApiKeyReader = {
    transaction: async () => {
      throw new Error("Project creation repository was not expected");
    },
    findActiveSecretApiKey: async () => ({ id: "key-1", projectId: "project-1", scopes: ["keys:write"] })
  };
  const apiKeyCreationRepository: ApiKeyCreationRepository = {
    transaction: async (operation) => operation(keyTransaction)
  };
  const revokeKey = vi.fn(async () => true);
  const revocationTransaction: ApiKeyRevocationTransaction = {
    lockIdempotencyScope: async () => undefined,
    findIdempotencyRecord: async () => undefined,
    findProjectInOrganization: async () => "project-2",
    findApiKey: async () => key,
    revokeApiKey: revokeKey,
    appendAuditEvent: async () => undefined,
    saveIdempotencyRecord: async () => undefined
  };
  const apiKeyRevocationRepository: ApiKeyRevocationRepository = {
    transaction: async (operation) => operation(revocationTransaction)
  };
  return {
    api: buildApi(config, undefined, { repository, apiKeyCreationRepository, apiKeyRevocationRepository }),
    createKey,
    revokeKey
  };
};

describe("POST /v1/developer/projects/:projectId/keys", () => {
  it("reveals generated key material once and omits it from a replay", async () => {
    const { api, createKey } = createApi();
    const request = {
      method: "POST" as const,
      url: "/v1/developer/projects/6b1617e4-9a45-4cc9-869e-d9d7d9d3e401/keys",
      headers: {
        authorization: `Bearer sk_${"a".repeat(43)}`,
        "idempotency-key": "api-key-create-123"
      },
      payload: { kind: "publishable", scopes: [] }
    };

    const first = await api.inject(request);
    const second = await api.inject(request);

    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ ...key, raw_key: expect.stringMatching(/^pk_/) });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ ...key });
    expect(createKey).toHaveBeenCalledTimes(1);
    await api.close();
  });

  it("revokes an API key without returning its metadata", async () => {
    const { api, revokeKey } = createApi();
    const response = await api.inject({
      method: "DELETE",
      url: "/v1/developer/projects/6b1617e4-9a45-4cc9-869e-d9d7d9d3e401/keys/59a8b9e4-455a-4af8-a879-47c03b49d7cb",
      headers: {
        authorization: `Bearer sk_${"a".repeat(43)}`,
        "idempotency-key": "api-key-revoke-123"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(revokeKey).toHaveBeenCalledTimes(1);
    await api.close();
  });
});
