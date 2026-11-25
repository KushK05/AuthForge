import { describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/app.js";
import type { AppConfig } from "../../src/platform/config.js";
import { Logger } from "../../src/platform/logger.js";
import { hashOpaqueSecret } from "../../src/shared/crypto/opaque-secret.js";
import { MemoryShowcaseStore } from "../../src/platform/memory-store.js";
import { MemoryConsoleRateLimiter } from "../../src/platform/redis.js";
import { demoPassword } from "../support/demo-user.js";
import { FakeAuthEmailSender } from "../support/fake-auth-email-sender.js";

const config: AppConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 0,
  logLevel: "info",
  databaseUrl: "postgres://authforge:authforge@localhost:5432/authforge",
  redisUrl: "redis://localhost:6379",
  awsRegion: "us-east-1",
  credentialHashKey: "hash-key-at-least-32-random-characters-long",
  consoleOrigin: "http://127.0.0.1:8080",
  defaultSessionTtlSeconds: 900,
  maxSessionTtlSeconds: 3_600,
  maxSubjectLength: 128,
  maxApiKeys: 10,
  maxSessions: 20,
  authEmailFromEmail: "sender@authforge.demo",
  authEmailTestRecipient: "learner@authforge.demo",
  secureCookies: true
};

const origin = { origin: config.consoleOrigin };

describe("M1 Mandatory End-to-End Journey and Security Gate", () => {
  it("executes the complete console and API-key lifecycle with zero secret leakage in logs", async () => {
    const logLines: string[] = [];
    const logger = new Logger("info", config.environment, (line) => logLines.push(line));
    const store = new MemoryShowcaseStore();
    const rateLimiter = new MemoryConsoleRateLimiter(5, 60_000);
    const sender = new FakeAuthEmailSender();
    const app = buildApi(config, store, rateLimiter, logger, undefined, sender);

    try {
      // Step 1: Health check
      const live = await app.inject({ method: "GET", url: "/health/live" });
      expect(live.statusCode).toBe(200);
      expect(live.headers["x-request-id"]).toMatch(/^req_/);

      const ready = await app.inject({ method: "GET", url: "/health/ready" });
      expect(ready.statusCode).toBe(200);

      // Step 2: Throttling repeated failed sign-ins (5 failures -> 429)
      const badPassword = "wrong-password-123456";
      for (let i = 0; i < 5; i++) {
        const fail = await app.inject({
          method: "POST",
          url: "/v1/auth/login",
          headers: origin,
          payload: { email: "learner@authforge.demo", password: badPassword }
        });
        expect(fail.statusCode).toBe(401);
        expect(fail.json().error.code).toBe("invalid_user_credentials");
      }
      const throttled = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        headers: origin,
        payload: { email: "learner@authforge.demo", password: badPassword }
      });
      expect(throttled.statusCode).toBe(429);
      expect(throttled.json().error.code).toBe("rate_limited");

      // Reset limiter to allow a legitimate sign-in
      await rateLimiter.reset(`auth:${hashOpaqueSecret("127.0.0.1", config.credentialHashKey).toString("hex")}`);

      // Step 3: Register, verify, and assert cookie flags, CSRF token, and Cache-Control: no-store
      const registered = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: origin,
        payload: { email: "learner@authforge.demo", password: demoPassword }
      });
      expect(registered.statusCode).toBe(202);
      const login = await app.inject({
        method: "POST",
        url: "/v1/auth/verify-email",
        headers: origin,
        payload: { token: sender.verificationTokens.at(-1) }
      });
      expect(login.statusCode).toBe(200);
      expect(login.headers["cache-control"]).toBe("no-store");
      const cookieHeader = String(login.headers["set-cookie"]);
      expect(cookieHeader).toContain("HttpOnly");
      expect(cookieHeader).toContain("SameSite=Strict");
      expect(cookieHeader).toContain("Secure");
      const cookie = cookieHeader.split(";")[0]!;
      const csrfToken = login.json().csrf_token as string;
      expect(csrfToken).toMatch(/^csrf_[A-Za-z0-9_-]+/);

      // Step 4: Verify console state is initially empty
      const initialState = await app.inject({
        method: "GET",
        url: "/v1/console/state",
        headers: { ...origin, cookie }
      });
      expect(initialState.statusCode).toBe(200);
      expect(initialState.json().api_keys).toEqual([]);
      expect(initialState.json().sessions).toEqual([]);

      // Step 5: Reject console mutations without CSRF proof or untrusted Origin
      const noCsrf = await app.inject({
        method: "POST",
        url: "/v1/api-keys",
        headers: { ...origin, cookie },
        payload: { name: "test-key" }
      });
      expect(noCsrf.statusCode).toBe(403);
      expect(noCsrf.json().error.code).toBe("invalid_csrf");

      const badOrigin = await app.inject({
        method: "POST",
        url: "/v1/api-keys",
        headers: { origin: "https://untrusted-site.com", cookie, "x-csrf-token": csrfToken },
        payload: { name: "test-key" }
      });
      expect(badOrigin.statusCode).toBe(403);
      expect(badOrigin.json().error.code).toBe("invalid_csrf");

      // Step 6: Create API key, assert one-time reveal with Cache-Control: no-store
      const createKey = await app.inject({
        method: "POST",
        url: "/v1/api-keys",
        headers: { ...origin, cookie, "x-csrf-token": csrfToken },
        payload: { name: "showcase-service" }
      });
      expect(createKey.statusCode).toBe(201);
      expect(createKey.headers["cache-control"]).toBe("no-store");
      const keyData = createKey.json();
      expect(keyData.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(keyData.name).toBe("showcase-service");
      expect(keyData.prefix).toMatch(/^sk_[A-Za-z0-9_-]+/);
      expect(keyData.secret).toMatch(/^sk_[A-Za-z0-9_-]{43}$/);
      expect(keyData.prefix).toBe(keyData.secret.slice(0, 11));
      const rawSecret = keyData.secret as string;

      // Step 7: List API keys - confirm metadata only, no raw secret
      const listKeys = await app.inject({
        method: "GET",
        url: "/v1/api-keys",
        headers: { ...origin, cookie }
      });
      expect(listKeys.statusCode).toBe(200);
      const keysList = listKeys.json().data as Array<Record<string, unknown>>;
      expect(keysList.length).toBe(1);
      expect(keysList[0]?.id).toBe(keyData.id);
      expect(keysList[0]?.prefix).toBe(keyData.prefix);
      expect(keysList[0]).not.toHaveProperty("secret");
      expect(keysList[0]).not.toHaveProperty("secretDigest");

      // Step 8: Authenticate with the API key (e.g. creating session)
      const session = await app.inject({
        method: "POST",
        url: "/v1/sessions",
        headers: { authorization: `Bearer ${rawSecret}` },
        payload: { subject: "demo-subject-1" }
      });
      expect(session.statusCode).toBe(201);
      const sessionData = session.json();

      // Step 9: Revoke API key (console mutation) and assert cascade revocation
      const revokeKey = await app.inject({
        method: "DELETE",
        url: `/v1/api-keys/${keyData.id}`,
        headers: { ...origin, cookie, "x-csrf-token": csrfToken }
      });
      expect(revokeKey.statusCode).toBe(204);

      // Repeated revocation is idempotent
      const repeatRevoke = await app.inject({
        method: "DELETE",
        url: `/v1/api-keys/${keyData.id}`,
        headers: { ...origin, cookie, "x-csrf-token": csrfToken }
      });
      expect(repeatRevoke.statusCode).toBe(204);

      // Key can no longer authenticate
      const authAfterRevoke = await app.inject({
        method: "POST",
        url: "/v1/sessions",
        headers: { authorization: `Bearer ${rawSecret}` },
        payload: { subject: "demo-subject-2" }
      });
      expect(authAfterRevoke.statusCode).toBe(401);
      expect(authAfterRevoke.json().error.code).toBe("invalid_api_key");

      // Owned session is invalidated by cascade revocation
      const sessionValidate = await app.inject({
        method: "POST",
        url: "/v1/sessions/validate",
        headers: { authorization: `Bearer ${rawSecret}` },
        payload: { token: sessionData.token }
      });
      expect(sessionValidate.statusCode).toBe(401);

      // Step 10: Sign out of the browser session
      const logout = await app.inject({
        method: "DELETE",
        url: "/v1/auth/session",
        headers: { ...origin, cookie, "x-csrf-token": csrfToken }
      });
      expect(logout.statusCode).toBe(204);
      expect(logout.headers["set-cookie"]).toContain("Max-Age=0");

      // Future console calls fail
      const consoleAfter = await app.inject({
        method: "GET",
        url: "/v1/console/state",
        headers: { ...origin, cookie }
      });
      expect(consoleAfter.statusCode).toBe(401);
      expect(consoleAfter.json().error.code).toBe("invalid_user_credentials");

      // Step 11: Security check - assert ZERO credentials or secrets leaked into logs
      expect(logLines.length).toBeGreaterThan(0);
      const combinedLogs = logLines.join("\n");

      expect(combinedLogs).not.toContain(badPassword);
      expect(combinedLogs).not.toContain(demoPassword);
      expect(combinedLogs).not.toContain(cookie);
      expect(combinedLogs).not.toContain(rawSecret);
      expect(combinedLogs).not.toContain(csrfToken);
      expect(combinedLogs).not.toContain("demo-subject-1");

      for (const line of logLines) {
        expect(() => JSON.parse(line)).not.toThrow();
        const parsed = JSON.parse(line) as Record<string, unknown>;
        expect(parsed).not.toHaveProperty("authorization");
        expect(parsed).not.toHaveProperty("cookie");
        expect(parsed).not.toHaveProperty("secret");
        expect(parsed).not.toHaveProperty("password");
      }
    } finally {
      await app.close();
    }
  });
});
