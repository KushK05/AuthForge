import { describe, expect, it } from "vitest";

import { loadConfig, loadMigrationConfig, loadWorkerConfig } from "../../src/platform/config.js";

const validEnvironment = {
  DATABASE_URL: "postgres://authforge:authforge@localhost:5432/authforge",
  REDIS_URL: "redis://localhost:6379",
  AWS_REGION: "us-east-1",
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
  it("requires authentication mail sender and one configured test inbox as a pair", () => {
    expect(() => loadConfig({...validEnvironment, AUTH_EMAIL_FROM_EMAIL: "sender@example.com"})).toThrow("both authentication email sender and test recipient");
    expect(() => loadConfig({...validEnvironment, AUTH_EMAIL_FROM_EMAIL: "same@example.com", AUTH_EMAIL_TEST_RECIPIENT: "SAME@example.com"})).toThrow("must be different addresses");
    expect(() => loadConfig({...validEnvironment, NODE_ENV: "production", SECURE_COOKIES: "true", CONSOLE_ORIGIN: "https://authforge.example.com", DATABASE_URL: "postgres://demo:demo@database.example.com/authforge?sslmode=verify-full", REDIS_URL: "rediss://redis.example.com:6379"})).toThrow("verified test recipient");
  });

  it("ignores a leftover CONSOLE_ACCESS_CODE from an older environment", () => {
    const config = loadConfig({...validEnvironment, CONSOLE_ACCESS_CODE: "old-access-code-from-env"});
    expect(config).not.toHaveProperty("consoleAccessCode");
    expect(JSON.stringify(config)).not.toContain("old-access-code-from-env");
    expect(loadConfig(validEnvironment)).toEqual(config);
  });

  it("rejects incomplete configuration without exposing values", () => {
    expect(() => loadConfig({ AWS_REGION: "us-east-1" })).toThrow(
      "Invalid configuration: DATABASE_URL, REDIS_URL, CREDENTIAL_HASH_KEY"
    );
  });
  it("rejects an excessive default TTL, insecure deployed cookies, and non-simulator mail", () => {
    expect(() => loadConfig({...validEnvironment, DEFAULT_SESSION_TTL_SECONDS: "3600", MAX_SESSION_TTL_SECONDS: "60"})).toThrow("TTL");
    expect(() => loadConfig({...validEnvironment, NODE_ENV: "production"})).toThrow("HTTPS");
    expect(() => loadConfig({...validEnvironment, SHOWCASE_SES_FROM_EMAIL: "sender@authforge.demo", SHOWCASE_SES_SIMULATOR_EMAIL: "real@example.com"})).toThrow("simulator");
    expect(() => loadConfig({...validEnvironment, CONSOLE_ORIGIN: "http://localhost/path"})).toThrow("origin");
  });
  it("requires verified TLS and real AWS endpoints for deployed tasks", () => {
    const deployed = {...validEnvironment, NODE_ENV: "production", SECURE_COOKIES: "true", CONSOLE_ORIGIN: "https://authforge.example.com", DATABASE_URL: "postgres://demo:demo@database.example.com/authforge?sslmode=verify-full", REDIS_URL: "rediss://redis.example.com:6379", AUTH_EMAIL_FROM_EMAIL: "sender@example.com", AUTH_EMAIL_TEST_RECIPIENT: "learner@example.test"};
    expect(loadConfig(deployed).secureCookies).toBe(true);
    expect(() => loadConfig({...deployed, DATABASE_URL: validEnvironment.DATABASE_URL})).toThrow("verify-full");
    expect(() => loadConfig({...deployed, REDIS_URL: "redis://redis.example.com"})).toThrow("TLS");
    expect(() => loadConfig({...deployed, AWS_S3_ENDPOINT_URL: "http://localstack:4566"})).toThrow("emulator");
    expect(() => loadWorkerConfig(deployed)).toThrow("worker");
  });
  it("loads migration and worker configuration without API credentials or Redis", () => {
    const isolated = {NODE_ENV: "test", DATABASE_URL: validEnvironment.DATABASE_URL,
      CREDENTIAL_HASH_KEY: "ignored", REDIS_URL: "invalid"};
    expect(loadMigrationConfig(isolated)).toEqual({environment: "test", logLevel: "info", databaseUrl: validEnvironment.DATABASE_URL});
    const worker = loadWorkerConfig(isolated);
    expect(worker).toMatchObject({environment: "test", databaseUrl: validEnvironment.DATABASE_URL, awsRegion: "us-east-1"});
    for (const field of ["credentialHashKey", "redisUrl"]) expect(worker).not.toHaveProperty(field);
    expect(() => loadConfig(isolated)).toThrow("configuration");
  });
  it("enforces migration TLS without requiring browser cookie settings", () => {
    expect(loadMigrationConfig({NODE_ENV: "production", DATABASE_URL: validEnvironment.DATABASE_URL + "?sslmode=verify-full"}).environment).toBe("production");
    expect(() => loadMigrationConfig({NODE_ENV: "production", DATABASE_URL: validEnvironment.DATABASE_URL})).toThrow("verify-full");
  });
  it("loads a deployed worker with only its database secret and event settings", () => {
    const worker = {NODE_ENV: "production", DATABASE_URL: validEnvironment.DATABASE_URL + "?sslmode=verify-full",
      SHOWCASE_QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/123456789012/demo",
      SHOWCASE_S3_BUCKET: "demo-artifacts", SHOWCASE_S3_KMS_KEY_ID: "demo-kms",
      SHOWCASE_SES_FROM_EMAIL: "showcase@mail.example.com", SHOWCASE_SES_SIMULATOR_EMAIL: "success@simulator.amazonses.com"};
    expect(loadWorkerConfig(worker)).not.toHaveProperty("credentialHashKey");
    expect(() => loadWorkerConfig({...worker, AWS_S3_ENDPOINT_URL: "http://localstack:4566"})).toThrow("emulator");
    expect(() => loadWorkerConfig({...worker, SHOWCASE_SES_SIMULATOR_EMAIL: "someone@example.com"})).toThrow("simulator");
    expect(() => loadWorkerConfig({...worker, DATABASE_URL: validEnvironment.DATABASE_URL})).toThrow("verify-full");
    const classroom = loadWorkerConfig({...worker, CLASSROOM_DIRECT_EVENTS: "true", SHOWCASE_QUEUE_URL: "", SHOWCASE_S3_KMS_KEY_ID: ""});
    expect(classroom.classroomDirectEvents).toBe(true);
    expect(classroom).not.toHaveProperty("showcaseQueueUrl");
  });
});
