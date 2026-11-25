import argon2 from "argon2";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi } from "../../src/api/app.js";
import { loadConfig } from "../../src/platform/config.js";
import { MemoryShowcaseStore } from "../../src/platform/memory-store.js";
import { MemoryConsoleRateLimiter } from "../../src/platform/redis.js";
import { Logger } from "../../src/platform/logger.js";
import { FakeAuthEmailSender } from "../support/fake-auth-email-sender.js";

const config = loadConfig({NODE_ENV: "test", DATABASE_URL: "postgres://test:test@localhost/test", REDIS_URL: "redis://localhost", CONSOLE_ACCESS_CODE: "test-console-access-code", CREDENTIAL_HASH_KEY: "test-credential-hash-key-at-least-32", AUTH_EMAIL_FROM_EMAIL: "sender@authforge.demo", AUTH_EMAIL_TEST_RECIPIENT: "learner@authforge.demo", SECURE_COOKIES: "true"});
const origin = {origin: config.consoleOrigin};
const identity = {email: "learner@authforge.demo", password: "a-demo-password-123"};
const apps: ReturnType<typeof buildApi>[] = [];
afterEach(async () => {vi.useRealTimers(); await Promise.all(apps.splice(0).map(app => app.close()));});
function setup(overrides = {}, limiter = new MemoryConsoleRateLimiter(100)) {
  const store = new MemoryShowcaseStore();
  const sender = new FakeAuthEmailSender();
  const logs: string[] = [];
  const app = buildApi({...config, ...overrides}, store, limiter, new Logger("info", "test", line => logs.push(line)), undefined, sender);
  apps.push(app);
  const register = (payload = identity, headers = origin) => app.inject({method: "POST", url: "/v1/auth/register", headers, payload});
  const verify = (token = sender.verificationTokens.at(-1)!, headers = origin) => app.inject({method: "POST", url: "/v1/auth/verify-email", headers, payload: {token}});
  const reset = (token: string, password: string) => app.inject({method: "POST", url: "/v1/auth/password-reset/confirm", headers: origin, payload: {token, password}});
  return {app, store, sender, logs, register, verify, reset};
}

describe("hosted demo authentication emails", () => {
  it("registers a pending Argon2id user, verifies once by email, restores CSRF after reload, and signs out", async () => {
    const {app, store, sender, logs, register, verify} = setup();
    const response = await register({...identity, email: " Learner@AUTHFORGE.DEMO "});
    expect(response.statusCode).toBe(202);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body).not.toContain(sender.verificationTokens[0]);
    const token = sender.verificationTokens[0]!;
    const user = await store.findUserByEmail(identity.email);
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(user!.passwordHash, identity.password)).toBe(true);
    expect(user?.emailVerifiedAt).toBeUndefined();
    expect(await verify("verify_" + "x".repeat(43))).toMatchObject({statusCode: 401});
    const verified = await verify(token);
    expect(verified.statusCode).toBe(200);
    expect(verified.headers["cache-control"]).toBe("no-store");
    const cookie = String(verified.headers["set-cookie"]).split(";")[0]!;
    expect(verified.headers["set-cookie"]).toContain("HttpOnly");
    expect(verified.headers["set-cookie"]).toContain("Secure");
    expect(verified.headers["set-cookie"]).toContain("SameSite=Strict");
    expect((await verify(token)).statusCode).toBe(401);
    const me = await app.inject({method: "GET", url: "/v1/auth/me", headers: {...origin, cookie}});
    expect(me.statusCode).toBe(200);
    expect(me.json().csrf_token).toBe(verified.json().csrf_token);
    const logout = await app.inject({method: "DELETE", url: "/v1/auth/session", headers: {...origin, cookie, "x-csrf-token": me.json().csrf_token}});
    expect(logout.statusCode).toBe(204);
    expect(logout.headers["set-cookie"]).toContain("Max-Age=0");
    expect((await app.inject({method: "GET", url: "/v1/auth/me", headers: {cookie}})).statusCode).toBe(401);
    const verifiedUser = await store.findUserByEmail(identity.email);
    expect(verifiedUser?.emailVerifiedAt).toBeInstanceOf(Date);
    for (const secret of [identity.email, identity.password, cookie, token, me.json().csrf_token, user!.passwordHash]) expect(logs.join("")).not.toContain(secret);
  });

  it("requires exact Origin and CSRF for sign-out", async () => {
    const {app, register, verify} = setup(); await register();
    const login = await verify();
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

  it("keeps registration private and requires verification before password sign-in", async () => {
    const {app, sender, register, verify} = setup();
    expect((await register({...identity, email: "someone@example.com"})).statusCode).toBe(400);
    expect((await register({...identity, password: "short"})).statusCode).toBe(400);
    expect((await register()).statusCode).toBe(202);
    const firstToken = sender.verificationTokens.at(-1)!;
    const count = sender.verificationTokens.length;
    expect((await register()).statusCode).toBe(202);
    expect(sender.verificationTokens).toHaveLength(count);
    for (const payload of [identity, {...identity, password: "wrong-password-123"}, {...identity, email: "unknown@authforge.demo"}]) {
      const response = await app.inject({method: "POST", url: "/v1/auth/login", headers: origin, payload});
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("invalid_user_credentials");
    }
    expect((await verify(firstToken)).statusCode).toBe(200);
    expect((await app.inject({method: "POST", url: "/v1/auth/login", headers: origin, payload: identity})).statusCode).toBe(200);
    expect((await app.inject({method: "POST", url: "/v1/auth/login", payload: identity})).statusCode).toBe(403);
  });

  it("sends generic reset responses, consumes the reset once, and revokes existing browser sessions", async () => {
    const {app, store, sender, logs, register, verify, reset} = setup();
    await register();
    const verified = await verify();
    const oldCookie = String(verified.headers["set-cookie"]).split(";")[0]!;
    const beforeHash = (await store.findUserByEmail(identity.email))!.passwordHash;
    const unknown = await app.inject({method: "POST", url: "/v1/auth/password-reset", headers: origin, payload: {email: "unknown@authforge.demo"}});
    expect(unknown.statusCode).toBe(202);
    const requested = await app.inject({method: "POST", url: "/v1/auth/password-reset", headers: origin, payload: {email: identity.email}});
    expect(requested.statusCode).toBe(202);
    expect(requested.body).toBe(unknown.body);
    const token = sender.resetTokens.at(-1)!;
    expect(requested.body).not.toContain(token);
    expect((await reset(token, "short")).statusCode).toBe(400);
    expect((await reset(token, "replacement-password-456")).statusCode).toBe(204);
    expect((await reset(token, "replacement-password-456")).statusCode).toBe(401);
    expect((await app.inject({method: "GET", url: "/v1/auth/me", headers: {cookie: oldCookie}})).statusCode).toBe(401);
    expect((await app.inject({method: "POST", url: "/v1/auth/login", headers: origin, payload: identity})).statusCode).toBe(401);
    expect((await app.inject({method: "POST", url: "/v1/auth/login", headers: origin, payload: {...identity, password: "replacement-password-456"}})).statusCode).toBe(200);
    const afterHash = (await store.findUserByEmail(identity.email))!.passwordHash;
    expect(afterHash).not.toBe(beforeHash);
    expect(await argon2.verify(afterHash, "replacement-password-456")).toBe(true);
    expect(logs.join("")).not.toContain(token);
  });

  it("invalidates earlier verification links on resend and expires reset links", async () => {
    const {app, sender, register, verify} = setup();
    await register();
    const first = sender.verificationTokens.at(-1)!;
    expect((await app.inject({method: "POST", url: "/v1/auth/verification-email", headers: origin, payload: {email: identity.email}})).statusCode).toBe(202);
    const second = sender.verificationTokens.at(-1)!;
    expect(second).not.toBe(first);
    expect((await verify(first)).statusCode).toBe(401);
    expect((await verify(second)).statusCode).toBe(200);
    expect((await app.inject({method: "POST", url: "/v1/auth/password-reset", headers: origin, payload: {email: identity.email}})).statusCode).toBe(202);
    const resetToken = sender.resetTokens.at(-1)!;
    vi.useFakeTimers({toFake: ["Date"]}); vi.setSystemTime(Date.now() + 15 * 60_000 + 1);
    expect((await app.inject({method: "POST", url: "/v1/auth/password-reset/confirm", headers: origin, payload: {token: resetToken, password: "replacement-password-456"}})).statusCode).toBe(401);
  });

  it("throttles hosted authentication attempts and trusts only the configured proxy hops", async () => {
    const {app} = setup({}, new MemoryConsoleRateLimiter(1));
    const request = {method: "POST" as const, url: "/v1/auth/login", headers: origin, payload: identity};
    expect((await app.inject(request)).statusCode).toBe(401);
    expect((await app.inject(request)).statusCode).toBe(429);
    for (const trustProxy of [false, true]) {
      const proxyApp = buildApi({...config, trustProxy}, new MemoryShowcaseStore(), new MemoryConsoleRateLimiter(1), undefined, undefined, new FakeAuthEmailSender());
      apps.push(proxyApp);
      const attempt = (prefix: string, viewer = "198.51.100.10") => proxyApp.inject({
        method: "POST", url: "/v1/auth/login", remoteAddress: "10.0.0.10",
        headers: {...origin, "x-forwarded-for": `${prefix}, ${viewer}, 203.0.113.10`}, payload: identity
      });
      expect((await attempt("192.0.2.1")).statusCode).toBe(401);
      expect((await attempt("192.0.2.2")).statusCode).toBe(429);
    }
  });
});
