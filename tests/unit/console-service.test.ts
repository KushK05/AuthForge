import { describe, expect, it } from "vitest";

import { ConsoleService } from "../../src/modules/developer-console/console-service.js";
import type { AppConfig } from "../../src/platform/config.js";
import { MemoryShowcaseStore } from "../../src/platform/memory-store.js";
import { MemoryConsoleRateLimiter } from "../../src/platform/redis.js";

const testConfig: AppConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 0,
  logLevel: "error",
  databaseUrl: "postgres://authforge:authforge@localhost:5432/authforge",
  redisUrl: "redis://localhost:6379",
  awsRegion: "us-east-1",
  consoleAccessCode: "showcase-test-access-code",
  credentialHashKey: "showcase-credential-hash-key-at-least-32-bytes",
  consoleOrigin: "http://127.0.0.1:8080",
  defaultSessionTtlSeconds: 900,
  maxSessionTtlSeconds: 3_600,
  maxSubjectLength: 128,
  maxApiKeys: 10,
  maxSessions: 20,
  maxConsoleSessions: 2,
  accessTokenTtlSeconds: 300,
  secureCookies: false
};

describe("ConsoleService", () => {
  const createService = (configOverrides?: Partial<AppConfig>) => {
    const config = { ...testConfig, ...configOverrides };
    const store = new MemoryShowcaseStore();
    const rateLimiter = new MemoryConsoleRateLimiter(5, 60_000);
    const service = new ConsoleService(config, store, rateLimiter);
    return { service, store, rateLimiter, config };
  };

  describe("login", () => {
    it("creates console session and returns token and csrfToken on valid access code", async () => {
      const { service } = createService();
      const result = await service.login(testConfig.consoleAccessCode, "127.0.0.1");

      expect(result.token).toMatch(/^cs_[A-Za-z0-9_-]+/);
      expect(result.csrfToken).toMatch(/^csrf_[A-Za-z0-9_-]+/);
    });

    it("rejects invalid access code with 401 invalid_console_access", async () => {
      const { service } = createService();
      await expect(service.login("wrong-code", "127.0.0.1")).rejects.toMatchObject({
        status: 401,
        code: "invalid_console_access"
      });
    });

    it("rejects when maximum console sessions capacity is reached", async () => {
      const { service } = createService({ maxConsoleSessions: 1 });
      await service.login(testConfig.consoleAccessCode, "127.0.0.1");

      await expect(service.login(testConfig.consoleAccessCode, "127.0.0.2")).rejects.toMatchObject({
        status: 429,
        code: "capacity_exceeded"
      });
    });
  });

  describe("verifySession", () => {
    it("verifies an active session on GET requests with matching or omitted Origin", async () => {
      const { service } = createService();
      const { token } = await service.login(testConfig.consoleAccessCode, "127.0.0.1");

      const sessionNoOrigin = await service.verifySession(token, undefined, false);
      expect(sessionNoOrigin).toBeDefined();

      const sessionWithOrigin = await service.verifySession(token, testConfig.consoleOrigin, false);
      expect(sessionWithOrigin).toBeDefined();
    });

    it("rejects GET request if browser Origin does not match configured console Origin", async () => {
      const { service } = createService();
      const { token } = await service.login(testConfig.consoleAccessCode, "127.0.0.1");

      await expect(
        service.verifySession(token, "https://malicious-site.com", false)
      ).rejects.toMatchObject({
        status: 403,
        code: "invalid_csrf"
      });
    });

    it("rejects mutations without matching Origin or without valid CSRF token", async () => {
      const { service } = createService();
      const { token, csrfToken } = await service.login(testConfig.consoleAccessCode, "127.0.0.1");

      // Wrong origin
      await expect(
        service.verifySession(token, "https://attacker.com", true, csrfToken)
      ).rejects.toMatchObject({
        status: 403,
        code: "invalid_csrf"
      });

      // Missing origin on mutation
      await expect(
        service.verifySession(token, undefined, true, csrfToken)
      ).rejects.toMatchObject({
        status: 403,
        code: "invalid_csrf"
      });

      // Missing CSRF token
      await expect(
        service.verifySession(token, testConfig.consoleOrigin, true, undefined)
      ).rejects.toMatchObject({
        status: 403,
        code: "invalid_csrf"
      });

      // Tampered CSRF token
      await expect(
        service.verifySession(token, testConfig.consoleOrigin, true, "csrf_tampered")
      ).rejects.toMatchObject({
        status: 403,
        code: "invalid_csrf"
      });

      // Valid mutation
      const session = await service.verifySession(token, testConfig.consoleOrigin, true, csrfToken);
      expect(session).toBeDefined();
    });

    it("rejects invalid or missing console cookie token", async () => {
      const { service } = createService();
      await expect(
        service.verifySession(undefined, testConfig.consoleOrigin, false)
      ).rejects.toMatchObject({
        status: 401,
        code: "invalid_console_session"
      });

      await expect(
        service.verifySession("cs_non_existent", testConfig.consoleOrigin, false)
      ).rejects.toMatchObject({
        status: 401,
        code: "invalid_console_session"
      });
    });

    it("rejects revoked console sessions", async () => {
      const { service } = createService();
      const { token } = await service.login(testConfig.consoleAccessCode, "127.0.0.1");
      const session = await service.verifySession(token, testConfig.consoleOrigin, false);

      await service.revokeSession(session.id);

      await expect(
        service.verifySession(token, testConfig.consoleOrigin, false)
      ).rejects.toMatchObject({
        status: 401,
        code: "invalid_console_session"
      });
    });
  });

  describe("getState", () => {
    it("returns formatted state summaries", async () => {
      const { service } = createService();
      const state = await service.getState();
      expect(state).toHaveProperty("api_keys");
      expect(state).toHaveProperty("sessions");
      expect(Array.isArray(state.api_keys)).toBe(true);
      expect(Array.isArray(state.sessions)).toBe(true);
    });
  });
});
