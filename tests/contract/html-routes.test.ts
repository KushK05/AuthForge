import { afterAll, describe, expect, it } from "vitest";

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

const pages = ["/", "/signup", "/login", "/verify-email", "/forgot-password", "/reset-password", "/docs", "/console"];

describe("HTML and script routes", () => {
  const app = buildApi(config, new MemoryShowcaseStore());
  afterAll(async () => { await app.close(); });

  it.each(pages)("serves %s as no-store HTML under a strict CSP", async (url) => {
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    const csp = String(response.headers["content-security-policy"]);
    expect(csp).toContain("default-src 'none'");
    const scriptSrc = csp.split(";").map((part) => part.trim()).find((part) => part.startsWith("script-src"));
    expect(scriptSrc).toBe("script-src 'self'");
    expect(response.body).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(response.body).not.toMatch(/\son[a-z]+=/);
  });

  it.each(pages)("references only same-origin JavaScript routes from %s", async (url) => {
    const html = (await app.inject({ method: "GET", url })).body;
    const sources = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]!);
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.startsWith("/")).toBe(true);
      const script = await app.inject({ method: "GET", url: source });
      expect(script.statusCode).toBe(200);
      expect(script.headers["content-type"]).toContain("application/javascript");
      expect(script.headers["cache-control"]).toBe("no-store");
    }
  });

  it("does not render access-code UI or unsupported feature claims", async () => {
    for (const url of pages) {
      const body = (await app.inject({ method: "GET", url })).body;
      expect(body).not.toMatch(/access code/i);
      expect(body).not.toMatch(/\bMFA\b|social login|\bSSO\b/);
    }
  });
});
