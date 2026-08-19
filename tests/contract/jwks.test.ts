import { afterAll, describe, expect, it, vi } from "vitest";

import { buildApi } from "../../src/api/app.js";
import type { SessionDependencies } from "../../src/api/app.js";
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

const sessionDependencies: SessionDependencies = {
  accessTokenJwksProvider: {
    jwks: vi.fn(async () => ({
      keys: [{ kty: "RSA", kid: "kms-key", use: "sig", alg: "PS256", n: "modulus", e: "AQAB" }]
    }))
  }
};
const api = buildApi(config, undefined, undefined, undefined, undefined, sessionDependencies);

afterAll(async () => api.close());

describe("GET /v1/projects/:projectId/.well-known/jwks.json", () => {
  it("returns the public signing key with a cache lifetime", async () => {
    const response = await api.inject({
      method: "GET",
      url: "/v1/projects/018f64a2-c12c-7ba9-b2f3-6ad1b2c3d4e5/.well-known/jwks.json"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(response.json()).toEqual({
      keys: [{ kty: "RSA", kid: "kms-key", use: "sig", alg: "PS256", n: "modulus", e: "AQAB" }]
    });
  });

  it("rejects invalid project identifiers", async () => {
    const response = await api.inject({
      method: "GET",
      url: "/v1/projects/not-a-uuid/.well-known/jwks.json"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("invalid_request");
  });
});
