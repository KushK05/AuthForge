import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/platform/config.js";

const validEnvironment = {
  DATABASE_URL: "postgres://authforge:authforge@localhost:5432/authforge",
  REDIS_URL: "redis://localhost:6379",
  AWS_REGION: "us-east-1",
  CONSOLE_ACCESS_CODE: "test-console-access-code",
  CREDENTIAL_HASH_KEY: "test-credential-hash-key-with-32b"
};

describe("loadConfig", () => {
  it("applies safe local defaults", () => {
    expect(loadConfig(validEnvironment)).toMatchObject({
      environment: "development",
      host: "127.0.0.1",
      port: 8080,
      logLevel: "info",
      consoleOrigin: "http://127.0.0.1:8080",
      secureCookies: false
    });
  });

  it("rejects incomplete configuration without exposing values", () => {
    expect(() => loadConfig({ AWS_REGION: "us-east-1" })).toThrow(
      "Invalid configuration: DATABASE_URL, REDIS_URL, CONSOLE_ACCESS_CODE, CREDENTIAL_HASH_KEY"
    );
  });
});
