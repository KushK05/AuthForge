import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/platform/config.js";

const validEnvironment = {
  DATABASE_URL: "postgres://authforge:authforge@localhost:5432/authforge",
  REDIS_URL: "redis://localhost:6379",
  AWS_REGION: "us-east-1",
  API_KEY_HASH_KEY: "test-api-key-hashing-secret-value",
  PUBLIC_ISSUER_BASE_URL: "http://localhost:8080"
};

describe("loadConfig", () => {
  it("applies safe local defaults", () => {
    expect(loadConfig(validEnvironment)).toMatchObject({
      environment: "development",
      host: "127.0.0.1",
      port: 8080,
      logLevel: "info"
    });
  });

  it("rejects incomplete configuration without exposing values", () => {
    expect(() => loadConfig({ AWS_REGION: "us-east-1" })).toThrow(
      "Invalid configuration: DATABASE_URL, REDIS_URL"
    );
  });
});
