import { afterAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/app.js";
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
const api = buildApi(config);

afterAll(async () => api.close());

describe("operational endpoints", () => {
  it("returns health with an opaque request ID", async () => {
    const response = await api.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toMatch(/^req_/);
  });

  it("preserves a valid caller request ID", async () => {
    const response = await api.inject({
      method: "GET",
      url: "/readyz",
      headers: { "x-request-id": "request_12345678" }
    });

    expect(response.headers["x-request-id"]).toBe("request_12345678");
  });
});
