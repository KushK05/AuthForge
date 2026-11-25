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
async function localActionToken(kind: "verify" | "reset"): Promise<string> {
  const endpoint = process.env.AUTHFORGE_LOCAL_SES_CAPTURE_URL ?? "http://127.0.0.1:4566/_aws/ses";
  const response = await fetch(endpoint);
  assert.equal(response.ok, true, "LocalStack SES capture endpoint is unavailable");
  const payload: unknown = await response.json();
  const strings: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      strings.push(value);
      const decoded = Buffer.from(value, "base64").toString("utf8");
      if (decoded.length >= value.length * 0.65 && /[\x20-\x7e]/.test(decoded)) strings.push(decoded);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(payload);
  const tokens = strings.flatMap(value => value.match(new RegExp(`${kind}_[A-Za-z0-9_-]{43}`, "g")) ?? []);
  assert.ok(tokens.length, `LocalStack did not capture the ${kind} email`);
  return tokens.at(-1)!;
}

async function main(): Promise<void> {
  assert.equal((await request("/health/ready")).response.status, 200);
  const login = await request("/v1/console/session", "POST", {access_code: process.env.CONSOLE_ACCESS_CODE ?? "local-showcase-console-access-code"});
  assert.equal(login.response.status, 200);
  const consoleHeaders = {cookie: login.response.headers.getSetCookie()[0]!.split(";")[0]!, "x-csrf-token": login.data.csrf_token};
  const identity = {email: `${randomUUID()}@authforge.demo`, password: `A-${randomUUID()}-demo-password`};
  const registration = await request("/v1/auth/register", "POST", identity);
  assert.equal(registration.response.status, 202);
  let userHeaders: {cookie: string} | undefined;
  if (base.includes("127.0.0.1:8080") || process.env.AUTHFORGE_LOCAL_SES_CAPTURE_URL) {
    const verified = await request("/v1/auth/verify-email", "POST", {token: await localActionToken("verify")});
    assert.equal(verified.response.status, 200);
    userHeaders = {cookie: verified.response.headers.getSetCookie()[0]!.split(";")[0]!};
    assert.equal((await request("/v1/auth/me", "GET", undefined, userHeaders)).response.status, 200);
    assert.equal((await request("/v1/auth/password-reset", "POST", {email: identity.email})).response.status, 202);
    const replacementPassword = `C-${randomUUID()}-replacement-password`;
    const reset = await request("/v1/auth/password-reset/confirm", "POST", {token: await localActionToken("reset"), password: replacementPassword});
    assert.equal(reset.response.status, 204);
    assert.equal((await request("/v1/auth/me", "GET", undefined, userHeaders)).response.status, 401);
    const signIn = await request("/v1/auth/login", "POST", {...identity, password: replacementPassword});
    assert.equal(signIn.response.status, 200);
    userHeaders = {cookie: signIn.response.headers.getSetCookie()[0]!.split(";")[0]!};
    const me = await request("/v1/auth/me", "GET", undefined, userHeaders);
    assert.equal(me.response.status, 200);
    assert.equal((await request("/v1/auth/session", "DELETE", undefined, {...userHeaders, "x-csrf-token": me.data.csrf_token})).response.status, 204);
    assert.equal((await request("/v1/auth/me", "GET", undefined, userHeaders)).response.status, 401);
  }
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
  process.stdout.write(`${userHeaders ? "Local demo passed: registration verification, password reset, hosted session, " : "Remote core demo passed: registration email queued, "}console, keys, sessions, ownership, revocation, and worker completion.\n`);
}
void main().catch(() => {process.stderr.write("Demo check failed. Inspect local service health and redacted logs.\n"); process.exitCode = 1;});
