import { afterAll, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/app.js";
import type { AppConfig } from "../../src/platform/config.js";
import { MemoryShowcaseStore } from "../../src/platform/memory-store.js";

const config: AppConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 0,
  logLevel: "error",
  databaseUrl: "postgres://authforge:authforge@localhost:5432/authforge",
  redisUrl: "redis://localhost:6379",
  awsRegion: "us-east-1",
  consoleAccessCode: "test-console-access-code",
  credentialHashKey: "test-credential-hash-key-with-32b",
  consoleOrigin: "http://127.0.0.1:8080",
  defaultSessionTtlSeconds: 900,
  maxSessionTtlSeconds: 3_600,
  maxSubjectLength: 128,
  maxApiKeys: 10,
  maxSessions: 20,
  maxConsoleSessions: 20,
  secureCookies: false
};
const api = buildApi(config, new MemoryShowcaseStore());

afterAll(async () => api.close());

describe("operational endpoints", () => {
  it("returns live health with an opaque request ID", async () => {
    const response = await api.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toMatch(/^req_/);
  });

  it("preserves a valid caller request ID on readiness", async () => {
    const response = await api.inject({
      method: "GET",
      url: "/health/ready",
      headers: { "x-request-id": "request_12345678" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe("request_12345678");
  });
});
