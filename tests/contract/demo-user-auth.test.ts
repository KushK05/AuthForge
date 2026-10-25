import argon2 from "argon2";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi } from "../../src/api/app.js";
import { loadConfig } from "../../src/platform/config.js";
import { MemoryShowcaseStore } from "../../src/platform/memory-store.js";
import { MemoryConsoleRateLimiter } from "../../src/platform/redis.js";
import { Logger } from "../../src/platform/logger.js";

const config = loadConfig({NODE_ENV: "test", DATABASE_URL: "postgres://test:test@localhost/test", REDIS_URL: "redis://localhost", CONSOLE_ACCESS_CODE: "test-console-access-code", CREDENTIAL_HASH_KEY: "test-credential-hash-key-at-least-32", SECURE_COOKIES: "true"});
const origin = {origin: config.consoleOrigin};
const identity = {email: "learner@authforge.demo", password: "a-demo-password-123"};
const apps: ReturnType<typeof buildApi>[] = [];
afterEach(async () => {vi.useRealTimers(); await Promise.all(apps.splice(0).map(app => app.close()));});
function setup(overrides = {}) {
  const store = new MemoryShowcaseStore();
  const logs: string[] = [];
  const app = buildApi({...config, ...overrides}, store, new MemoryConsoleRateLimiter(100), new Logger("info", "test", line => logs.push(line)));
  apps.push(app);
  const register = (payload = identity) => app.inject({method: "POST", url: "/v1/auth/register", headers: origin, payload});
  return {app, store, logs, register};
}

describe("hosted demo authentication", () => {
  it("registers atomically, stores Argon2id, restores CSRF after reload, and signs out", async () => {
    const {app, store, logs, register} = setup();
    const response = await register({...identity, email: " Learner@AUTHFORGE.DEMO "});
    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    const cookie = String(response.headers["set-cookie"]).split(";")[0]!;
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("Secure");
    expect(response.headers["set-cookie"]).toContain("SameSite=Strict");
    const user = await store.findUserByEmail(identity.email);
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(user!.passwordHash, identity.password)).toBe(true);
    expect(response.body).not.toContain(user!.passwordHash);
    const me = await app.inject({method: "GET", url: "/v1/auth/me", headers: {...origin, cookie}});
    expect(me.statusCode).toBe(200);
    expect(me.json().csrf_token).toBe(response.json().csrf_token);
    const logout = await app.inject({method: "DELETE", url: "/v1/auth/session", headers: {...origin, cookie, "x-csrf-token": me.json().csrf_token}});
    expect(logout.statusCode).toBe(204);
    expect(logout.headers["set-cookie"]).toContain("Max-Age=0");
    expect((await app.inject({method: "GET", url: "/v1/auth/me", headers: {cookie}})).statusCode).toBe(401);
    for (const secret of [identity.email, identity.password, cookie, me.json().csrf_token, user!.passwordHash]) expect(logs.join("")).not.toContain(secret);
  });

  it("requires exact Origin and CSRF for sign-out", async () => {
    const {app, register} = setup();
    const login = await register();
    const cookie = String(login.headers["set-cookie"]);
    for (const headers of [
      {cookie, "x-csrf-token": login.json().csrf_token},
      {cookie, origin: "https://untrusted.example", "x-csrf-token": login.json().csrf_token},
      {cookie, ...origin}, {cookie, ...origin, "x-csrf-token": "incorrect"}
    ]) {
      const response = await app.inject({method: "DELETE", url: "/v1/auth/session", headers});
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("invalid_csrf");
    }
  });

  it("rejects real email, short passwords, duplicate registration, and cross-origin login", async () => {
    const {app, register} = setup();
    expect((await register({...identity, email: "someone@example.com"})).statusCode).toBe(400);
    expect((await register({...identity, password: "short"})).statusCode).toBe(400);
    expect((await register()).statusCode).toBe(201);
    expect((await register()).statusCode).toBe(409);
    expect((await app.inject({method: "POST", url: "/v1/auth/login", payload: identity})).statusCode).toBe(403);
  });

  it("uses the same credential error for unknown emails and wrong passwords, then permits valid login", async () => {
    const {app, register} = setup(); await register();
    for (const payload of [{...identity, password: "wrong-password-123"}, {...identity, email: "unknown@authforge.demo"}]) {
      const response = await app.inject({method: "POST", url: "/v1/auth/login", headers: origin, payload});
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("invalid_user_credentials");
    }
    expect((await app.inject({method: "POST", url: "/v1/auth/login", headers: origin, payload: identity})).statusCode).toBe(200);
  });

  it("expires browser sessions and does not create a user when session capacity is exhausted", async () => {
    const {app, store, register} = setup({maxUserSessions: 1});
    const first = await register();
    expect((await register({...identity, email: "second@authforge.demo"})).statusCode).toBe(429);
    expect(await store.findUserByEmail("second@authforge.demo")).toBeUndefined();
    vi.useFakeTimers({toFake: ["Date"]}); vi.setSystemTime(Date.now() + 3_601_000);
    expect((await app.inject({method: "GET", url: "/v1/auth/me", headers: {cookie: String(first.headers["set-cookie"])}})).statusCode).toBe(401);
  });

  it("throttles hosted authentication requests", async () => {
    const store = new MemoryShowcaseStore(); const app = buildApi(config, store, new MemoryConsoleRateLimiter(1)); apps.push(app);
    const request = {method: "POST" as const, url: "/v1/auth/login", headers: origin, payload: identity};
    expect((await app.inject(request)).statusCode).toBe(401);
    expect((await app.inject(request)).statusCode).toBe(429);
  });
  it("ignores spoofed prefixes across the two AWS proxy hops for both login limiters", async () => {
    for (const trustProxy of [false, true]) {
      for (const url of ["/v1/console/session", "/v1/auth/login"]) {
        const app = buildApi({...config, trustProxy}, new MemoryShowcaseStore(), new MemoryConsoleRateLimiter(1));
        apps.push(app);
        const attempt = (prefix: string, viewer = "198.51.100.10") => app.inject({
          method: "POST", url, remoteAddress: "10.0.0.10",
          headers: {...origin, "x-forwarded-for": `${prefix}, ${viewer}, 203.0.113.10`},
          payload: url.includes("console") ? {access_code: "incorrect"} : identity
        });
        expect((await attempt("192.0.2.1")).statusCode).toBe(401);
        expect((await attempt("192.0.2.2")).statusCode).toBe(429);
        // A different real viewer gets its own bucket only in AWS proxy mode.
        expect((await attempt("192.0.2.3", "198.51.100.11")).statusCode).toBe(trustProxy ? 401 : 429);
      }
    }
  });

});
