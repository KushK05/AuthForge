import { afterAll, describe, expect, it } from "vitest";
import { buildApi } from "../../src/api/app.js";
import { loadConfig } from "../../src/platform/config.js";
import { MemoryShowcaseStore } from "../../src/platform/memory-store.js";

const config = loadConfig({NODE_ENV: "test", DATABASE_URL: "postgres://test:test@localhost/test", REDIS_URL: "redis://localhost", CONSOLE_ACCESS_CODE: "test-console-access-code", CREDENTIAL_HASH_KEY: "test-credential-hash-key-at-least-32", MAX_REQUEST_BODY_BYTES: "1024"});
const app = buildApi(config, new MemoryShowcaseStore());
afterAll(() => app.close());
describe("HTTP boundary", () => {
  it("uses the stable error shape for malformed JSON, oversized requests, and unknown routes", async () => {
    for (const request of [
      {method: "POST" as const, url: "/v1/console/session", headers: {"content-type": "application/json"}, payload: "{"},
      {method: "POST" as const, url: "/v1/console/session", payload: {access_code: "x".repeat(2000)}},
      {method: "GET" as const, url: "/does-not-exist"}
    ]) {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(request.method === "GET" ? 404 : 400);
      expect(response.json()).toEqual({error: {code: expect.any(String), message: expect.any(String), request_id: response.headers["x-request-id"]}});
    }
  });
  it("does not expose excluded JWT or refresh endpoints", async () => {
    expect((await app.inject({method: "GET", url: "/.well-known/jwks.json"})).statusCode).toBe(404);
    expect((await app.inject({method: "POST", url: "/v1/sessions/refresh", payload: {token: "test"}})).statusCode).toBe(404);
  });
  it("maps unavailable database connections to a redacted 503", async () => {
    const store = new MemoryShowcaseStore();
    const failing = buildApi({...config, logLevel: "error"}, store);
    try {
      const login = await failing.inject({method: "POST", url: "/v1/console/session", payload: {access_code: config.consoleAccessCode}});
      store.listApiKeys = async () => {throw Object.assign(new Error("secret database connection details"), {code: "ECONNRESET"});};
      const response = await failing.inject({method: "GET", url: "/v1/api-keys", headers: {cookie: String(login.headers["set-cookie"])}});
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("dependency_unavailable");
      expect(response.body).not.toContain("secret database");
    } finally {await failing.close();}
  });
});
