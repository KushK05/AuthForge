import { afterEach, describe, expect, it } from "vitest";

import { buildShowcaseApi } from "../../src/showcase/app.js";
import { MemoryShowcaseStore } from "../../src/showcase/memory-store.js";
import type { ShowcaseConfig } from "../../src/showcase/config.js";

const config: ShowcaseConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 0,
  logLevel: "error",
  databaseUrl: "postgres://authforge:authforge@localhost:5432/authforge",
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
  secureCookies: false
};

const origin = { origin: config.consoleOrigin };

describe("showcase API", () => {
  const apps: Array<Awaited<ReturnType<typeof buildShowcaseApi>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const createApp = () => {
    const app = buildShowcaseApi(config, new MemoryShowcaseStore());
    apps.push(app);
    return app;
  };

  it("creates and validates a session through the console-created API key", async () => {
    const app = createApp();
    const login = await app.inject({ method: "POST", url: "/v1/console/session", payload: { access_code: config.consoleAccessCode } });
    expect(login.statusCode).toBe(200);
    expect(login.headers["cache-control"]).toBe("no-store");
    const cookie = login.headers["set-cookie"];
    const csrf = login.json().csrf_token as string;

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
    const app = createApp();
    const login = await app.inject({ method: "POST", url: "/v1/console/session", payload: { access_code: config.consoleAccessCode } });
    const response = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { origin: config.consoleOrigin, cookie: login.headers["set-cookie"] },
      payload: { name: "blocked" }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("invalid_csrf");
  });

  it("revokes an API key and its sessions", async () => {
    const app = createApp();
    const login = await app.inject({ method: "POST", url: "/v1/console/session", payload: { access_code: config.consoleAccessCode } });
    const csrf = login.json().csrf_token as string;
    const keyResponse = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { ...origin, cookie: login.headers["set-cookie"], "x-csrf-token": csrf },
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
      headers: { ...origin, cookie: login.headers["set-cookie"], "x-csrf-token": csrf }
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
});
