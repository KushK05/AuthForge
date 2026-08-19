import { describe, expect, it, vi } from "vitest";

import {
  buildApi,
  type DeveloperPlatformDependencies,
  type IdentityDependencies
} from "../../src/api/app.js";
import type { DeveloperPlatformRepository } from "../../src/modules/developer-platform/application/create-project.js";
import type { SecretApiKeyReader } from "../../src/modules/developer-platform/application/authenticate-secret-key.js";
import type { SignUpRepository, SignUpTransaction } from "../../src/modules/identity/application/sign-up.js";
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

const createDependencies = (redirectUrlAllowed = true): Readonly<{
  developerPlatform: DeveloperPlatformDependencies;
  identity: IdentityDependencies;
  createUser: ReturnType<typeof vi.fn>;
}> => {
  let idempotencyRecord: Readonly<{ requestHash: Buffer; response: { status: "pending_verification" } }> | undefined;
  const createUser = vi.fn(async () => undefined);
  const transaction: SignUpTransaction = {
    lockIdempotencyScope: async () => undefined,
    lockEmailScope: async () => undefined,
    findIdempotencyRecord: async () => idempotencyRecord,
    findUserIdByEmail: async () => undefined,
    createUser,
    createVerificationToken: async () => undefined,
    appendAuditEvent: async () => undefined,
    appendOutboxEvent: async () => undefined,
    saveIdempotencyRecord: async (input) => {
      idempotencyRecord = { requestHash: input.requestHash, response: input.response };
    }
  };
  const identity: IdentityDependencies = {
    signUpRepository: { transaction: async (operation) => operation(transaction) } satisfies SignUpRepository
  };
  const repository = {} as DeveloperPlatformRepository & SecretApiKeyReader;
  return {
    developerPlatform: {
      repository,
      publishableApiKeyReader: {
        findActivePublishableApiKey: async () => ({ id: "key-1", projectId: "project-1" })
      },
      redirectUrlReader: { hasRedirectUrl: async () => redirectUrlAllowed }
    },
    identity,
    createUser
  };
};

describe("POST /v1/sign-ups", () => {
  it("requires a publishable key and idempotency key, then returns a generic accepted response", async () => {
    const { developerPlatform, identity, createUser } = createDependencies();
    const api = buildApi(config, undefined, developerPlatform, identity);
    const request = {
      method: "POST" as const,
      url: "/v1/sign-ups",
      headers: {
        authorization: `Bearer pk_${"a".repeat(43)}`,
        "idempotency-key": "sign-up-123"
      },
      payload: {
        email: "person@example.test",
        password: "this password is long enough",
        redirect_url: "https://app.example.test/verified"
      }
    };

    const first = await api.inject(request);
    const replay = await api.inject(request);
    const unauthenticated = await api.inject({
      ...request,
      headers: { "idempotency-key": "sign-up-456" }
    });

    expect(first.statusCode).toBe(202);
    expect(replay.statusCode).toBe(202);
    expect(first.json()).toEqual({ status: "pending_verification" });
    expect(replay.json()).toEqual({ status: "pending_verification" });
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json().code).toBe("invalid_credentials");
    await api.close();
  });

  it("rejects a redirect URL not configured for the authenticated project", async () => {
    const { developerPlatform, identity } = createDependencies(false);
    const api = buildApi(config, undefined, developerPlatform, identity);

    const response = await api.inject({
      method: "POST",
      url: "/v1/sign-ups",
      headers: {
        authorization: `Bearer pk_${"a".repeat(43)}`,
        "idempotency-key": "sign-up-789"
      },
      payload: {
        email: "person@example.test",
        password: "this password is long enough",
        redirect_url: "https://app.example.test/verified"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("invalid_request");
    await api.close();
  });
});
