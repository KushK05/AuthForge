import { constants, createPublicKey, verify } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/app.js";
import { LocalAccessTokenSigner, type AccessTokenSigner } from "../../src/modules/sessions/access-token-signer.js";
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
  consoleAccessCode: "showcase-console-access-code",
  credentialHashKey: "showcase-credential-hash-key-at-least-32",
  consoleOrigin: "http://127.0.0.1:8080",
  defaultSessionTtlSeconds: 900,
  maxSessionTtlSeconds: 3_600,
  maxSubjectLength: 128,
  maxApiKeys: 10,
  maxSessions: 20,
  maxConsoleSessions: 20,
  accessTokenTtlSeconds: 300,
  secureCookies: false
};

describe("session access tokens and refresh rotation", () => {
  const apps: Array<ReturnType<typeof buildApi>> = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const setup = async (signer: AccessTokenSigner = new LocalAccessTokenSigner(config.accessTokenTtlSeconds)) => {
    const app = buildApi(config, new MemoryShowcaseStore(), undefined, undefined, signer);
    apps.push(app);
    const login = await app.inject({ method: "POST", url: "/v1/console/session", payload: { access_code: config.consoleAccessCode } });
    const consoleHeaders = {
      origin: config.consoleOrigin,
      cookie: login.headers["set-cookie"] as string,
      "x-csrf-token": login.json().csrf_token as string
    };
    const newKey = async () => {
      const response = await app.inject({ method: "POST", url: "/v1/api-keys", headers: consoleHeaders, payload: { name: "k" } });
      return { id: response.json().id as string, auth: { authorization: `Bearer ${response.json().secret as string}` } };
    };
    const createSession = (auth: { authorization: string }, ttl?: number) =>
      app.inject({ method: "POST", url: "/v1/sessions", headers: auth, payload: { subject: "demo-user-1", ...(ttl ? { ttl_seconds: ttl } : {}) } });
    const refresh = (auth: { authorization: string }, token: string) =>
      app.inject({ method: "POST", url: "/v1/sessions/refresh", headers: auth, payload: { token } });
    const validate = (auth: { authorization: string }, token: string) =>
      app.inject({ method: "POST", url: "/v1/sessions/validate", headers: auth, payload: { token } });
    return { app, newKey, createSession, refresh, validate };
  };

  it("returns an access token that verifies offline against the public JWKS", async () => {
    const { app, newKey, createSession } = await setup();
    const key = await newKey();
    const created = await createSession(key.auth);
    expect(created.statusCode).toBe(201);
    expect(created.headers["cache-control"]).toBe("no-store");
    const body = created.json();
    expect(body).toMatchObject({ token_type: "Bearer", expires_in: 300 });

    const jwks = await app.inject({ method: "GET", url: "/.well-known/jwks.json" });
    expect(jwks.statusCode).toBe(200);
    expect(jwks.headers["cache-control"]).toBe("public, max-age=300");
    const jwk = jwks.json().keys[0];
    expect(jwk).not.toHaveProperty("d");

    const [header, payload, signature] = (body.access_token as string).split(".") as [string, string, string];
    expect(verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: createPublicKey({ key: jwk, format: "jwk" }), padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST },
      Buffer.from(signature, "base64url")
    )).toBe(true);
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toMatchObject({
      iss: config.consoleOrigin,
      aud: key.id,
      sub: "demo-user-1",
      sid: body.id
    });
  });

  it("caps the access token at the remaining session lifetime", async () => {
    const { newKey, createSession } = await setup();
    const key = await newKey();
    const created = await createSession(key.auth, 60);
    expect(created.json().expires_in).toBeLessThanOrEqual(60);
  });

  it("rotates the token, keeps the session expiry, and invalidates the old token", async () => {
    const { newKey, createSession, refresh, validate } = await setup();
    const key = await newKey();
    const created = (await createSession(key.auth)).json();

    const rotated = await refresh(key.auth, created.token);
    expect(rotated.statusCode).toBe(200);
    expect(rotated.headers["cache-control"]).toBe("no-store");
    const next = rotated.json();
    expect(next.token).not.toBe(created.token);
    expect(next.id).toBe(created.id);
    expect(next.expires_at).toBe(created.expires_at);
    expect(next.access_token).not.toBe(created.access_token);

    expect((await validate(key.auth, next.token)).statusCode).toBe(200);
    expect((await validate(key.auth, created.token)).statusCode).toBe(401);
  });

  it("revokes the whole session when a rotated token is replayed", async () => {
    const { newKey, createSession, refresh, validate } = await setup();
    const key = await newKey();
    const created = (await createSession(key.auth)).json();
    const next = (await refresh(key.auth, created.token)).json();

    const replay = await refresh(key.auth, created.token);
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe("invalid_session");

    expect((await validate(key.auth, next.token)).statusCode).toBe(401);
    expect((await refresh(key.auth, next.token)).statusCode).toBe(401);
  });

  it("does not let another API key refresh or replay-revoke a session", async () => {
    const { newKey, createSession, refresh, validate } = await setup();
    const owner = await newKey();
    const other = await newKey();
    const created = (await createSession(owner.auth)).json();
    const next = (await refresh(owner.auth, created.token)).json();

    expect((await refresh(other.auth, next.token)).statusCode).toBe(401);
    expect((await refresh(other.auth, created.token)).statusCode).toBe(401);
    expect((await validate(owner.auth, next.token)).statusCode).toBe(200);
  });

  it("rejects refresh for revoked sessions, revoked keys, and unknown tokens", async () => {
    const { app, newKey, createSession, refresh } = await setup();
    const key = await newKey();
    const created = (await createSession(key.auth)).json();
    await app.inject({ method: "DELETE", url: `/v1/sessions/${created.id as string}`, headers: key.auth });
    expect((await refresh(key.auth, created.token)).statusCode).toBe(401);
    expect((await refresh(key.auth, "sess_unknown")).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/sessions/refresh", payload: { token: "x" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/sessions/refresh", headers: key.auth, payload: {} })).statusCode).toBe(400);
  });

  it("fails closed with 503 and stores nothing when signing is unavailable", async () => {
    const failing: AccessTokenSigner = {
      issue: async () => { throw new Error("kms down"); },
      jwks: async () => { throw new Error("kms down"); }
    };
    const { app, newKey, createSession } = await setup(failing);
    const key = await newKey();
    const response = await createSession(key.auth);
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("dependency_unavailable");
    const list = await app.inject({ method: "GET", url: "/v1/sessions", headers: key.auth });
    expect(list.json().data).toHaveLength(0);
    expect((await app.inject({ method: "GET", url: "/.well-known/jwks.json" })).statusCode).toBe(503);
  });
});
