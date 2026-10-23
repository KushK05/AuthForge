import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresShowcaseStore } from "../../src/platform/postgres-store.js";
import type { ApiKeyRecord, ApplicationSessionRecord } from "../../src/platform/store.js";

const url = process.env.TEST_DATABASE_URL;

// Requires a migrated disposable database: TEST_DATABASE_URL=... npm test
describe.skipIf(!url)("PostgreSQL session rotation", () => {
  const sql = postgres(url ?? "postgres://unused", { max: 2 });
  const store = new PostgresShowcaseStore(sql);
  const now = new Date();
  const apiKey: ApiKeyRecord = { id: randomUUID(), name: "it", prefix: "sk_it", secretDigest: Buffer.from(randomUUID()), createdAt: now };

  const newSession = (): ApplicationSessionRecord => ({
    id: randomUUID(),
    apiKeyId: apiKey.id,
    subject: "demo-user-1",
    tokenDigest: Buffer.from(randomUUID()),
    createdAt: now,
    expiresAt: new Date(now.getTime() + 600_000)
  });

  beforeAll(async () => {
    await store.createApiKey(apiKey);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("rotates once, rejects a stale presenter, and detects replay", async () => {
    const session = newSession();
    await store.createSession(session);
    const next = Buffer.from(randomUUID());

    expect(await store.rotateSession(session.id, session.tokenDigest, next, new Date())).toBe(true);
    expect(await store.rotateSession(session.id, session.tokenDigest, Buffer.from(randomUUID()), new Date())).toBe(false);
    expect(await store.findSession(apiKey.id, next, new Date())).toBeDefined();
    expect(await store.findSession(apiKey.id, session.tokenDigest, new Date())).toBeUndefined();

    expect(await store.revokeReplayedSession(randomUUID(), session.tokenDigest, new Date())).toBe(false);
    expect(await store.revokeReplayedSession(apiKey.id, session.tokenDigest, new Date())).toBe(true);
    expect(await store.findSession(apiKey.id, next, new Date())).toBeUndefined();
  });

  it("does not rotate an expired or revoked session and records refresh events", async () => {
    const session = newSession();
    await store.createSession(session);
    expect(await store.rotateSession(session.id, session.tokenDigest, Buffer.from(randomUUID()), new Date(now.getTime() + 700_000))).toBe(false);
    await store.revokeSession(session.id, apiKey.id, new Date());
    expect(await store.rotateSession(session.id, session.tokenDigest, Buffer.from(randomUUID()), new Date())).toBe(false);

    const events = await sql<{ event_type: string }[]>`
      SELECT DISTINCT event_type FROM showcase_outbox_events WHERE event_type LIKE 'showcase.session.%'
    `;
    expect(events.map((row) => row.event_type)).toEqual(expect.arrayContaining(["showcase.session.refreshed", "showcase.session.replay_detected"]));
  });
});
