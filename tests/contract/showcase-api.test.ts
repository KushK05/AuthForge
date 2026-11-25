import { afterEach, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/app.js";
import type { AppConfig } from "../../src/platform/config.js";
import { MemoryShowcaseStore } from "../../src/platform/memory-store.js";
import { MemoryConsoleRateLimiter } from "../../src/platform/redis.js";
import { signInDemoUser } from "../support/demo-user.js";
import { FakeAuthEmailSender } from "../support/fake-auth-email-sender.js";

const config: AppConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 0,
  logLevel: "error",
  databaseUrl: "postgres://authforge:authforge@localhost:5432/authforge",
  redisUrl: "redis://localhost:6379",
  awsRegion: "us-east-1",
  credentialHashKey: "showcase-credential-hash-key-at-least-32",
  consoleOrigin: "http://127.0.0.1:8080",
  defaultSessionTtlSeconds: 900,
  maxSessionTtlSeconds: 3_600,
  maxSubjectLength: 128,
  maxApiKeys: 10,
  maxSessions: 20,
  authEmailFromEmail: "sender@authforge.demo",
  authEmailTestRecipient: "learner@authforge.demo",
  secureCookies: false
};

const origin = { origin: config.consoleOrigin };

describe("showcase API", () => {
  const apps: Array<Awaited<ReturnType<typeof buildApi>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const createApp = () => {
    const sender = new FakeAuthEmailSender();
    const app = buildApi(config, new MemoryShowcaseStore(), new MemoryConsoleRateLimiter(100), undefined, undefined, sender);
    apps.push(app);
    return { app, sender, signIn: () => signInDemoUser(app, sender, config.consoleOrigin) };
  };

  it("creates and validates a session through the console-created API key", async () => {
    const { app, signIn } = createApp();
    const { cookie, csrf } = await signIn();

    const keyResponse = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { ...origin, cookie, "x-csrf-token": csrf },
      payload: { name: "showcase" }
    });
    expect(keyResponse.statusCode).toBe(201);
    const secret = keyResponse.json().secret as string;

    const sessionResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers: { authorization: `Bearer ${secret}` },
      payload: { subject: "demo-user-1", ttl_seconds: 300 }
    });
    expect(sessionResponse.statusCode).toBe(201);
    const session = sessionResponse.json();

    const validation = await app.inject({
      method: "POST",
      url: "/v1/sessions/validate",
      headers: { authorization: `Bearer ${secret}` },
      payload: { token: session.token }
    });
    expect(validation.statusCode).toBe(200);
    expect(validation.json().session.subject).toBe("demo-user-1");
  });

  it("rejects console mutations without CSRF proof", async () => {
    const { app, signIn } = createApp();
    const { cookie, csrf } = await signIn();
    const wrong = await app.inject({ method: "POST", url: "/v1/api-keys", headers: { ...origin, cookie, "x-csrf-token": "csrf_wrong" }, payload: { name: "blocked" } });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().error.code).toBe("invalid_csrf");
    const untrusted = await app.inject({ method: "POST", url: "/v1/api-keys", headers: { origin: "https://untrusted.example", cookie, "x-csrf-token": csrf }, payload: { name: "blocked" } });
    expect(untrusted.statusCode).toBe(403);
    expect(untrusted.json().error.code).toBe("invalid_csrf");
    const response = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { origin: config.consoleOrigin, cookie },
      payload: { name: "blocked" }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("invalid_csrf");
  });

  it("revokes an API key and its sessions", async () => {
    const { app, signIn } = createApp();
    const { cookie, csrf } = await signIn();
    const keyResponse = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { ...origin, cookie, "x-csrf-token": csrf },
      payload: { name: "revoked" }
    });
    const key = keyResponse.json();
    const sessionResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers: { authorization: `Bearer ${key.secret}` },
      payload: { subject: "demo-user-1" }
    });

    const revoke = await app.inject({
      method: "DELETE",
      url: `/v1/api-keys/${key.id}`,
      headers: { ...origin, cookie, "x-csrf-token": csrf }
    });
    expect(revoke.statusCode).toBe(204);

    const validation = await app.inject({
      method: "POST",
      url: "/v1/sessions/validate",
      headers: { authorization: `Bearer ${key.secret}` },
      payload: { token: sessionResponse.json().token }
    });
    expect(validation.statusCode).toBe(401);
  });

  it("rejects console routes without a browser session", async () => {
    const { app } = createApp();
    for (const request of [
      { method: "GET" as const, url: "/v1/console/state" },
      { method: "GET" as const, url: "/v1/api-keys" },
      { method: "POST" as const, url: "/v1/api-keys", payload: { name: "x" } },
      { method: "DELETE" as const, url: "/v1/api-keys/6f1d1c7e-7d62-4a5c-9d57-2d9b1f1a7a01" },
      { method: "DELETE" as const, url: "/v1/console/sessions/6f1d1c7e-7d62-4a5c-9d57-2d9b1f1a7a01" }
    ]) {
      const response = await app.inject({ ...request, headers: origin });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("invalid_user_credentials");
    }
  });

  it("does not expose the removed console access-code routes", async () => {
    const { app } = createApp();
    for (const method of ["POST", "DELETE"] as const) {
      const response = await app.inject({ method, url: "/v1/console/session", headers: origin, ...(method === "POST" ? { payload: { access_code: "anything-at-all-123" } } : {}) });
      expect(response.statusCode).toBe(404);
    }
  });

  it("does not reach the console as an unverified user", async () => {
    const { app, sender } = createApp();
    const email = "pending@authforge.demo";
    await app.inject({ method: "POST", url: "/v1/auth/register", headers: origin, payload: { email, password: "a-demo-password-123" } });
    expect(sender.verificationTokens).toHaveLength(1);
    const login = await app.inject({ method: "POST", url: "/v1/auth/login", headers: origin, payload: { email, password: "a-demo-password-123" } });
    expect(login.statusCode).toBe(401);
    expect(login.json().error.code).toBe("invalid_user_credentials");
    expect(login.headers["set-cookie"]).toBeUndefined();
    expect((await app.inject({ method: "GET", url: "/v1/console/state", headers: origin })).statusCode).toBe(401);
  });

  it("fails closed with 503 dependency_unavailable when the rate limiter is unavailable", async () => {
    const failingRateLimiter = {
      assertAllowed: async () => { throw new Error("Redis cluster disconnected"); },
      recordFailure: async () => {},
      reset: async () => {},
      ready: async () => { throw new Error("Redis cluster disconnected"); }
    };
    const app = buildApi(config, new MemoryShowcaseStore(), failingRateLimiter);
    apps.push(app);
    const readyResponse = await app.inject({ method: "GET", url: "/health/ready" });
    expect(readyResponse.statusCode).toBe(503);
    expect(readyResponse.json().error.code).toBe("dependency_unavailable");
  });

  it("returns 401 from the console after the browser session is signed out", async () => {
    const { app, signIn } = createApp();
    const { cookie, csrf } = await signIn();
    expect((await app.inject({ method: "GET", url: "/v1/console/state", headers: { ...origin, cookie } })).statusCode).toBe(200);
    const logout = await app.inject({ method: "DELETE", url: "/v1/auth/session", headers: { ...origin, cookie, "x-csrf-token": csrf } });
    expect(logout.statusCode).toBe(204);
    expect(logout.headers["set-cookie"]).toContain("Max-Age=0");
    const after = await app.inject({ method: "GET", url: "/v1/console/state", headers: { ...origin, cookie } });
    expect(after.statusCode).toBe(401);
    expect(after.json().error.code).toBe("invalid_user_credentials");
  });

  it("enforces configured Origin on GET console routes when called with browser Origin header", async () => {
    const { app, signIn } = createApp();
    const { cookie } = await signIn();

    const blocked = await app.inject({
      method: "GET",
      url: "/v1/console/state",
      headers: { origin: "https://evil.example.com", cookie }
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("invalid_csrf");

    const allowed = await app.inject({
      method: "GET",
      url: "/v1/console/state",
      headers: { origin: config.consoleOrigin, cookie }
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toHaveProperty("api_keys");
    expect(allowed.json()).toHaveProperty("sessions");
  });

  it("allows revoking an application session directly through the console", async () => {
    const { app, signIn } = createApp();
    const { cookie, csrf } = await signIn();

    const keyResponse = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { ...origin, cookie, "x-csrf-token": csrf },
      payload: { name: "console-test-key" }
    });
    const secret = keyResponse.json().secret as string;

    const sessionResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers: { authorization: `Bearer ${secret}` },
      payload: { subject: "demo-user-console" }
    });
    const sessionId = sessionResponse.json().id as string;
    const sessionToken = sessionResponse.json().token as string;

    // Revoke through console route
    const revokeResponse = await app.inject({
      method: "DELETE",
      url: `/v1/console/sessions/${sessionId}`,
      headers: { ...origin, cookie, "x-csrf-token": csrf }
    });
    expect(revokeResponse.statusCode).toBe(204);

    // Repeated revocation returns 204
    const repeatRevoke = await app.inject({
      method: "DELETE",
      url: `/v1/console/sessions/${sessionId}`,
      headers: { ...origin, cookie, "x-csrf-token": csrf }
    });
    expect(repeatRevoke.statusCode).toBe(204);

    // Validation fails
    const validation = await app.inject({
      method: "POST",
      url: "/v1/sessions/validate",
      headers: { authorization: `Bearer ${secret}` },
      payload: { token: sessionToken }
    });
    expect(validation.statusCode).toBe(401);
  });

  it("lists API keys metadata and rejects invalid API key creations", async () => {
    const { app, signIn } = createApp();
    const { cookie, csrf } = await signIn();

    // Reject empty name
    const invalidCreate = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { ...origin, cookie, "x-csrf-token": csrf },
      payload: { name: "   " }
    });
    expect(invalidCreate.statusCode).toBe(400);
    expect(invalidCreate.json().error.code).toBe("invalid_request");

    // Create valid key
    const created = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { ...origin, cookie, "x-csrf-token": csrf },
      payload: { name: "demo-service-key" }
    });
    expect(created.statusCode).toBe(201);
    expect(created.headers["cache-control"]).toBe("no-store");

    // List keys
    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/api-keys",
      headers: { ...origin, cookie }
    });
    expect(listResponse.statusCode).toBe(200);
    const data = listResponse.json().data as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0]).toHaveProperty("prefix");
    expect(data[0]).not.toHaveProperty("secret");
    expect(data[0]).not.toHaveProperty("secretDigest");

    // Reject non-UUID delete
    const invalidDelete = await app.inject({
      method: "DELETE",
      url: "/v1/api-keys/not-a-uuid",
      headers: { ...origin, cookie, "x-csrf-token": csrf }
    });
    expect(invalidDelete.statusCode).toBe(400);
    expect(invalidDelete.json().error.code).toBe("invalid_request");
  });
});
