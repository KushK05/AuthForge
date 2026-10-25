import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { buildApi } from "../../src/api/app.js";
import { loadConfig } from "../../src/platform/config.js";
import { applyMigrations } from "../../src/platform/database/migrate.js";
import { PostgresShowcaseStore } from "../../src/platform/postgres-store.js";
import { RedisConsoleRateLimiter } from "../../src/platform/redis.js";
import { RedisValidationHints } from "../../src/platform/validation-hints.js";
import { hashOpaqueSecret } from "../../src/shared/crypto/opaque-secret.js";

// Only run against the explicitly provisioned disposable local test stack.
const enabled = process.env.AUTHFORGE_LOCAL_INTEGRATION === "true";
describe.skipIf(!enabled)("real PostgreSQL and Redis journey", () => {
  const config = loadConfig({NODE_ENV: "test", LOG_LEVEL: "error", DATABASE_URL: "postgres://authforge:authforge@127.0.0.1:55432/authforge", REDIS_URL: "redis://127.0.0.1:56379", CONSOLE_ACCESS_CODE: "test-console-access-code", CREDENTIAL_HASH_KEY: "test-credential-hash-key-at-least-32"});
  const sql = postgres(config.databaseUrl, {max: 1, onnotice: () => {}});
  const store = new PostgresShowcaseStore(sql);
  const redis = new Redis(config.redisUrl, {lazyConnect: true, maxRetriesPerRequest: 1});
  const limiter = new RedisConsoleRateLimiter(redis, 2, 1, `test:${randomUUID()}:`);
  const hints = new RedisValidationHints(redis);
  const app = buildApi(config, store, limiter, undefined, hints);
  let headers: {origin: string; cookie: string; "x-csrf-token": string};
  beforeAll(async () => {
    await applyMigrations(sql);
    await redis.connect();
    const response = await app.inject({method: "POST", url: "/v1/console/session", payload: {access_code: config.consoleAccessCode}});
    expect(response.statusCode).toBe(200);
    headers = {origin: config.consoleOrigin, cookie: String(response.headers["set-cookie"]), "x-csrf-token": response.json().csrf_token};
  });
  afterAll(async () => {await app.close(); await sql.end(); redis.disconnect();});

  it("applies the whole schema and is idempotent", async () => {
    expect(await applyMigrations(sql)).toEqual([]);
    const tables = await sql<{tablename: string}[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    expect(tables.map(t => t.tablename).sort()).toEqual(["schema_migrations", "showcase_api_keys", "showcase_console_sessions", "showcase_outbox_events", "showcase_sessions", "showcase_user_sessions", "showcase_users", "showcase_worker_inbox"].sort());
  });

  it("enforces key ownership, both revocation paths, expiry, and atomic outbox/cascade", async () => {
    const key = async () => (await app.inject({method: "POST", url: "/v1/api-keys", headers, payload: {name: "integration"}})).json();
    const owner = await key(), other = await key();
    const auth = {authorization: `Bearer ${owner.secret}`};
    const session = (await app.inject({method: "POST", url: "/v1/sessions", headers: auth, payload: {subject: "demo-user-1"}})).json();
    expect(session).not.toHaveProperty("access_token");
    const validate = (authorization: string, token = session.token) => app.inject({method: "POST", url: "/v1/sessions/validate", headers: {authorization}, payload: {token}});
    expect((await validate(auth.authorization)).statusCode).toBe(200);
    expect(await hints.get(owner.id, hashOpaqueSecret(session.token, config.credentialHashKey))).toBe(session.id);
    expect((await validate(`Bearer ${other.secret}`)).statusCode).toBe(401);
    expect((await app.inject({method: "DELETE", url: `/v1/sessions/${session.id}`, headers: {authorization: `Bearer ${other.secret}`}})).statusCode).toBe(404);
    const rows = await sql`SELECT * FROM showcase_outbox_events WHERE payload->>'session_id' = ${session.id}`;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("demo-user-1");
    for (let i = 0; i < 2; i++) expect((await app.inject({method: "DELETE", url: `/v1/console/sessions/${session.id}`, headers})).statusCode).toBe(204);
    expect((await validate(auth.authorization)).statusCode).toBe(401);
    const second = (await app.inject({method: "POST", url: "/v1/sessions", headers: auth, payload: {subject: "demo-user-2"}})).json();
    for (let i = 0; i < 2; i++) expect((await app.inject({method: "DELETE", url: `/v1/sessions/${second.id}`, headers: auth})).statusCode).toBe(204);
    const third = (await app.inject({method: "POST", url: "/v1/sessions", headers: auth, payload: {subject: "demo-user-3"}})).json();
    await store.revokeApiKey(owner.id, new Date());
    expect(await store.findSession(owner.id, hashOpaqueSecret(third.token, config.credentialHashKey), new Date())).toBeUndefined();
    expect((await validate(auth.authorization, third.token)).statusCode).toBe(401);
    const [revoked] = await sql`SELECT revoked_at FROM showcase_sessions WHERE id = ${third.id}`;
    expect(revoked?.revoked_at).not.toBeNull();
    const [counts] = await sql`SELECT count(*)::int AS count FROM showcase_outbox_events WHERE event_type = 'showcase.session.revoked' AND payload->>'session_id' = ${session.id}`;
    expect(counts?.count).toBe(1);
    const liveOwner = await store.findApiKey(hashOpaqueSecret(other.secret, config.credentialHashKey), new Date());
    const expired = {id: randomUUID(), apiKeyId: other.id, subject: "demo-expired", tokenDigest: Buffer.from(randomUUID()), createdAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() - 1000)};
    await store.createSession(expired);
    expect(liveOwner).toBeDefined();
    expect(await store.findSession(other.id, expired.tokenDigest, new Date())).toBeUndefined();
  });

  it("enforces concurrent capacity and rolls back a user when session insertion fails", async () => {
    const before = await store.listApiKeys();
    const results = await Promise.allSettled(Array.from({length: 3}, () => store.createApiKey({id: randomUUID(), name: "bounded", prefix: "sk_test", secretDigest: Buffer.from(randomUUID()), createdAt: new Date()}, before.length + 1)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const id = randomUUID();
    const user = {id, email: `${id}@authforge.demo`, passwordHash: "$argon2id$synthetic", createdAt: new Date()};
    await expect(store.createUserAndSession(user, {id: randomUUID(), userId: randomUUID(), tokenDigest: Buffer.from(randomUUID()), csrfDigest: Buffer.from(randomUUID()), createdAt: new Date(), expiresAt: new Date(Date.now() + 60000)}, 100, 100)).rejects.toBeDefined();
    expect(await store.findUserByEmail(user.email)).toBeUndefined();
  });

  it("uses real Redis counters with TTL and fails closed on connection loss", async () => {
    const bucket = randomUUID();
    await limiter.recordFailure(bucket); await limiter.recordFailure(bucket);
    await expect(limiter.assertAllowed(bucket)).rejects.toMatchObject({status: 429});
    await new Promise(resolve => setTimeout(resolve, 1100));
    await expect(limiter.assertAllowed(bucket)).resolves.toBeUndefined();
    const down = new Redis("redis://127.0.0.1:1", {lazyConnect: true, enableOfflineQueue: false, retryStrategy: () => null});
    down.on("error", () => {});
    await expect(new RedisConsoleRateLimiter(down).assertAllowed(bucket)).rejects.toMatchObject({status: 503});
    down.disconnect();
  });
});
