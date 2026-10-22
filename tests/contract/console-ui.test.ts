import { afterEach, describe, expect, it } from "vitest";

import { buildApi } from "../../src/api/app.js";
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
  secureCookies: false
};

describe("developer console UI routes", () => {
  const apps: Array<Awaited<ReturnType<typeof buildApi>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const createApp = () => {
    const app = buildApi(config, new MemoryShowcaseStore());
    apps.push(app);
    return app;
  };

  it("serves the developer console HTML at / with security headers", async () => {
    const app = createApp();
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.body).toContain("AuthForge - Developer Console & Evaluation Showcase");
    expect(res.body).toContain('id="form-login"');
    expect(res.body).toContain('id="view-dashboard"');
  });

  it("serves the developer console HTML at /console", async () => {
    const app = createApp();
    const res = await app.inject({ method: "GET", url: "/console" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Developer Console");
  });

  it("serves the CSS stylesheet at /console/styles.css", async () => {
    const app = createApp();
    const res = await app.inject({ method: "GET", url: "/console/styles.css" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/css");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.body).toContain("--bg-canvas");
    expect(res.body).toContain(".glass-panel");
  });

  it("serves the client script at /console/app.js", async () => {
    const app = createApp();
    const res = await app.inject({ method: "GET", url: "/console/app.js" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/javascript");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.body).toContain("AuthForge Developer Console");
    expect(res.body).toContain("requestApi");
  });

  it("serves the SVG favicon at /favicon.svg", async () => {
    const app = createApp();
    const res = await app.inject({ method: "GET", url: "/favicon.svg" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/svg+xml");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.body).toContain("<svg");
  });
});
