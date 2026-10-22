import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { MemoryShowcaseStore } from "../../src/platform/memory-store.js";
import type { ApiKeyRecord, ApplicationSessionRecord, ConsoleSessionRecord } from "../../src/platform/store.js";

describe("ShowcaseStore (console sessions and API keys)", () => {
  const sampleConsoleSession = (overrides?: Partial<ConsoleSessionRecord>): ConsoleSessionRecord => {
    const now = new Date();
    return {
      id: randomUUID(),
      tokenDigest: Buffer.from("token-digest-1"),
      csrfDigest: Buffer.from("csrf-digest-1"),
      createdAt: now,
      expiresAt: new Date(now.getTime() + 900_000),
      ...overrides
    };
  };

  const sampleApiKey = (overrides?: Partial<ApiKeyRecord>): ApiKeyRecord => {
    const now = new Date();
    return {
      id: randomUUID(),
      name: "test-api-key",
      prefix: "sk_demo_1234",
      secretDigest: Buffer.from("secret-digest-1"),
      createdAt: now,
      ...overrides
    };
  };

  describe("Console Sessions", () => {
    it("creates and finds an active console session by token digest", async () => {
      const store = new MemoryShowcaseStore();
      const record = sampleConsoleSession();
      await store.createConsoleSession(record);

      const found = await store.findConsoleSession(record.tokenDigest, new Date());
      expect(found).toBeDefined();
      expect(found?.id).toBe(record.id);
      expect(found?.csrfDigest).toEqual(record.csrfDigest);
    });

    it("does not find expired console sessions", async () => {
      const store = new MemoryShowcaseStore();
      const past = new Date(Date.now() - 10_000);
      const record = sampleConsoleSession({
        createdAt: new Date(past.getTime() - 900_000),
        expiresAt: past
      });
      await store.createConsoleSession(record);

      const found = await store.findConsoleSession(record.tokenDigest, new Date());
      expect(found).toBeUndefined();
    });

    it("does not find revoked console sessions", async () => {
      const store = new MemoryShowcaseStore();
      const record = sampleConsoleSession();
      await store.createConsoleSession(record);

      await store.revokeConsoleSession(record.id, new Date());

      const found = await store.findConsoleSession(record.tokenDigest, new Date());
      expect(found).toBeUndefined();
    });

    it("counts active console sessions accurately", async () => {
      const store = new MemoryShowcaseStore();
      expect(await store.countConsoleSessions()).toBe(0);

      await store.createConsoleSession(sampleConsoleSession());
      expect(await store.countConsoleSessions()).toBe(1);
    });
  });

  describe("API Keys", () => {
    it("creates and finds an active API key by secret digest", async () => {
      const store = new MemoryShowcaseStore();
      const record = sampleApiKey();
      await store.createApiKey(record);

      const found = await store.findApiKey(record.secretDigest, new Date());
      expect(found).toBeDefined();
      expect(found?.id).toBe(record.id);
      expect(found?.name).toBe(record.name);
      expect(found?.prefix).toBe(record.prefix);
    });

    it("does not find a revoked API key", async () => {
      const store = new MemoryShowcaseStore();
      const record = sampleApiKey();
      await store.createApiKey(record);

      await store.revokeApiKey(record.id, new Date());

      const found = await store.findApiKey(record.secretDigest, new Date());
      expect(found).toBeUndefined();
    });

    it("lists API keys ordered by created_at descending", async () => {
      const store = new MemoryShowcaseStore();
      const first = sampleApiKey({ name: "key-1", createdAt: new Date(Date.now() - 1000) });
      const second = sampleApiKey({ name: "key-2", createdAt: new Date() });

      await store.createApiKey(first);
      await store.createApiKey(second);

      const list = await store.listApiKeys();
      expect(list.length).toBe(2);
      expect(list[0]?.id).toBe(second.id);
      expect(list[1]?.id).toBe(first.id);
    });

    it("cascades revocation to owned application sessions when an API key is revoked", async () => {
      const store = new MemoryShowcaseStore();
      const apiKey = sampleApiKey();
      await store.createApiKey(apiKey);

      const session: ApplicationSessionRecord = {
        id: randomUUID(),
        apiKeyId: apiKey.id,
        subject: "demo-subject",
        tokenDigest: Buffer.from("session-token-digest"),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 900_000)
      };
      await store.createSession(session);

      const foundBefore = await store.findSession(apiKey.id, session.tokenDigest, new Date());
      expect(foundBefore).toBeDefined();

      await store.revokeApiKey(apiKey.id, new Date());

      const foundAfter = await store.findSession(apiKey.id, session.tokenDigest, new Date());
      expect(foundAfter).toBeUndefined();
    });
  });
});
