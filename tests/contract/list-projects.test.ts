import { describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/app.js";
import type { SecretApiKeyReader } from "../../src/modules/developer-platform/application/authenticate-secret-key.js";
import type { DeveloperPlatformRepository, ProjectSummary } from "../../src/modules/developer-platform/application/create-project.js";
import type { ProjectListReader } from "../../src/modules/developer-platform/application/list-projects.js";
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
  tokenDerivationKey: "test-token-derivation-key-with-32-bytes",
  publicIssuerBaseUrl: "http://localhost:8080",
  passwordMinLength: 12,
  argon2: { memoryKiB: 19_456, iterations: 2, parallelism: 1 }
};

const project: ProjectSummary = {
  id: "6b1617e4-9a45-4cc9-869e-d9d7d9d3e401",
  name: "Payments",
  status: "active",
  defaultEnvironment: {
    id: "59a8b9e4-455a-4af8-a879-47c03b49d7cb",
    name: "development",
    issuer: "http://localhost:8080/v1/projects/6b1617e4-9a45-4cc9-869e-d9d7d9d3e401",
    audience: "59a8b9e4-455a-4af8-a879-47c03b49d7cb"
  }
};

describe("GET /v1/developer/projects", () => {
  it("returns a cursor-paginated list scoped by the authenticated project", async () => {
    const repository: DeveloperPlatformRepository & SecretApiKeyReader = {
      transaction: async () => {
        throw new Error("Project mutations are not expected");
      },
      findActiveSecretApiKey: async () => ({ id: "key-1", projectId: project.id, scopes: ["projects:read"] })
    };
    const reader: ProjectListReader = {
      listProjects: async (input) => {
        expect(input).toEqual({ authenticatedProjectId: project.id, cursor: undefined, limit: 50 });
        return { data: [project], nextCursor: undefined };
      }
    };
    const api = buildApi(config, undefined, { repository, projectListReader: reader });

    const response = await api.inject({
      method: "GET",
      url: "/v1/developer/projects",
      headers: { authorization: `Bearer sk_${"a".repeat(43)}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [project] });
    await api.close();
  });
});
