import { describe, expect, it, vi } from "vitest";

import { buildApi, type DeveloperPlatformDependencies } from "../../src/api/app.js";
import type { SecretApiKeyReader } from "../../src/modules/developer-platform/application/authenticate-secret-key.js";
import type {
  DeveloperPlatformRepository,
  DeveloperPlatformTransaction,
  ProjectSummary
} from "../../src/modules/developer-platform/application/create-project.js";
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

const project: ProjectSummary = {
  id: "project-2",
  name: "Payments",
  status: "active",
  defaultEnvironment: {
    id: "environment-2",
    name: "development",
    issuer: "http://localhost:8080/v1/projects/project-2",
    audience: "environment-2"
  }
};

const createDependencies = (scopes = ["projects:write"]): Readonly<{
  dependencies: DeveloperPlatformDependencies;
  createProject: ReturnType<typeof vi.fn>;
}> => {
  let idempotencyRecord: Readonly<{ requestHash: Buffer; project: ProjectSummary }> | undefined;
  const createProject = vi.fn(async () => project);
  const transaction: DeveloperPlatformTransaction = {
    findOrganizationIdForProject: async () => "organization-1",
    lockIdempotencyScope: async () => undefined,
    findIdempotencyRecord: async () => idempotencyRecord,
    createProject,
    saveIdempotencyRecord: async (input) => {
      idempotencyRecord = { requestHash: input.requestHash, project: input.project };
    },
    appendAuditEvent: async () => undefined
  };
  const repository: DeveloperPlatformRepository & SecretApiKeyReader = {
    transaction: async (operation) => operation(transaction),
    findActiveSecretApiKey: async () => ({ id: "key-1", projectId: "project-1", scopes })
  };
  return { dependencies: { repository }, createProject };
};

describe("POST /v1/developer/projects", () => {
  it("creates a scoped project and replays a matching idempotent request", async () => {
    const { dependencies, createProject } = createDependencies();
    const endpoint = buildApi(config, undefined, dependencies);
    const request = {
      method: "POST" as const,
      url: "/v1/developer/projects",
      headers: {
        authorization: `Bearer sk_${"a".repeat(43)}`,
        "idempotency-key": "project-create-123"
      },
      payload: { name: "Payments" }
    };

    const first = await endpoint.inject(request);
    const second = await endpoint.inject(request);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(first.json()).toEqual(project);
    expect(second.json()).toEqual(project);
    expect(createProject).toHaveBeenCalledTimes(1);
    await endpoint.close();
  });

  it("rejects unauthenticated and insufficiently scoped requests", async () => {
    const { dependencies } = createDependencies([]);
    const api = buildApi(config, undefined, dependencies);
    const unauthenticated = await api.inject({
      method: "POST",
      url: "/v1/developer/projects",
      headers: { "idempotency-key": "project-create-123" },
      payload: { name: "Payments" }
    });
    const forbidden = await api.inject({
      method: "POST",
      url: "/v1/developer/projects",
      headers: {
        authorization: `Bearer sk_${"a".repeat(43)}`,
        "idempotency-key": "project-create-123"
      },
      payload: { name: "Payments" }
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json().code).toBe("invalid_credentials");
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().code).toBe("forbidden");
    await api.close();
  });
});
