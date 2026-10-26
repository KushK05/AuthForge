import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadLocalEnvironmentFile } from "../src/platform/config.js";

loadLocalEnvironmentFile();
const base = process.env.AUTHFORGE_BASE_URL ?? "http://127.0.0.1:8080";
const origin = {origin: base};
async function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(base + path, {method, headers: {...origin, ...(body ? {"content-type": "application/json"} : {}), ...headers}, ...(body ? {body: JSON.stringify(body)} : {})});
  const data = response.status === 204 ? undefined : await response.json();
  return {response, data};
}

async function main(): Promise<void> {
  assert.equal((await request("/health/ready")).response.status, 200);
  const login = await request("/v1/console/session", "POST", {access_code: process.env.CONSOLE_ACCESS_CODE ?? "local-showcase-console-access-code"});
  assert.equal(login.response.status, 200);
  const consoleHeaders = {cookie: login.response.headers.getSetCookie()[0]!.split(";")[0]!, "x-csrf-token": login.data.csrf_token};
  const identity = {email: `${randomUUID()}@authforge.demo`, password: randomUUID()};
  const registration = await request("/v1/auth/register", "POST", identity);
  assert.equal(registration.response.status, 201);
  const userHeaders = {cookie: registration.response.headers.getSetCookie()[0]!.split(";")[0]!};
  const me = await request("/v1/auth/me", "GET", undefined, userHeaders);
  assert.equal(me.response.status, 200);
  assert.equal((await request("/v1/auth/session", "DELETE", undefined, {...userHeaders, "x-csrf-token": me.data.csrf_token})).response.status, 204);
  assert.equal((await request("/v1/auth/me", "GET", undefined, userHeaders)).response.status, 401);
  const key = await request("/v1/api-keys", "POST", {name: "local-smoke"}, consoleHeaders);
  const otherKey = await request("/v1/api-keys", "POST", {name: "local-smoke-other"}, consoleHeaders);
  assert.equal(key.response.status, 201); assert.equal(otherKey.response.status, 201);
  const auth = {authorization: `Bearer ${key.data.secret}`};
  const session = await request("/v1/sessions", "POST", {subject: "demo-smoke-user"}, auth);
  assert.equal(session.response.status, 201);
  assert.equal((await request("/v1/sessions/validate", "POST", {token: session.data.token}, auth)).response.status, 200);
  assert.equal((await request("/v1/sessions/validate", "POST", {token: session.data.token}, {authorization: `Bearer ${otherKey.data.secret}`})).response.status, 401);
  assert.equal((await request(`/v1/console/sessions/${session.data.id}`, "DELETE", undefined, consoleHeaders)).response.status, 204);
  assert.equal((await request("/v1/sessions/validate", "POST", {token: session.data.token}, auth)).response.status, 401);
  assert.equal((await request(`/v1/api-keys/${key.data.id}`, "DELETE", undefined, consoleHeaders)).response.status, 204);
  assert.equal((await request(`/v1/api-keys/${otherKey.data.id}`, "DELETE", undefined, consoleHeaders)).response.status, 204);
  assert.equal((await request("/v1/sessions", "GET", undefined, auth)).response.status, 401);
  let processed = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const state = await request("/v1/console/state", "GET", undefined, consoleHeaders);
    processed = state.data.events.some((event: {id: string; processed_at: string | null}) => event.id === session.data.id && event.processed_at);
    if (processed) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(processed, "Local worker did not complete the synthetic session event");
  assert.equal((await request("/v1/console/session", "DELETE", undefined, consoleHeaders)).response.status, 204);
  process.stdout.write("Local demo passed: hosted authentication, console, keys, sessions, ownership, revocation, and worker completion.\n");
}
void main().catch(() => {process.stderr.write("Local demo check failed. Inspect local service health and redacted logs.\n"); process.exitCode = 1;});
