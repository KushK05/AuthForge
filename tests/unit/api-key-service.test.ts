import { describe, expect, it } from "vitest";

import { ApiKeyService } from "../../src/modules/api-keys/api-key-service.js";
import type { AppConfig } from "../../src/platform/config.js";
import { MemoryShowcaseStore } from "../../src/platform/memory-store.js";

const testConfig: AppConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 0,
  logLevel: "error",
  databaseUrl: "postgres://authforge:authforge@localhost:5432/authforge",
  redisUrl: "redis://localhost:6379",
  awsRegion: "us-east-1",
  consoleAccessCode: "showcase-test-access-code",
  credentialHashKey: "showcase-credential-hash-key-at-least-32-bytes",
  consoleOrigin: "http://127.0.0.1:8080",
  defaultSessionTtlSeconds: 900,
  maxSessionTtlSeconds: 3_600,
  maxSubjectLength: 128,
  maxApiKeys: 3,
  maxSessions: 20,
  maxConsoleSessions: 20,
  secureCookies: false
};

describe("ApiKeyService", () => {
  const createService = (configOverrides?: Partial<AppConfig>) => {
    const config = { ...testConfig, ...configOverrides };
    const store = new MemoryShowcaseStore();
    const service = new ApiKeyService(config, store);
    return { service, store, config };
  };

  describe("createKey", () => {
    it("creates an API key with sk_ prefix and returns secret only once", async () => {
      const { service } = createService();
      const created = await service.createKey("  production-service  ");

      expect(created.name).toBe("production-service");
      expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(created.secret).toMatch(/^sk_[A-Za-z0-9_-]{43}$/);
      expect(created.prefix).toBe(created.secret.slice(0, 11));
      expect(created.created_at).toBeDefined();
    });

    it("rejects empty name or oversized name", async () => {
      const { service } = createService();

      await expect(service.createKey("")).rejects.toMatchObject({
        status: 400,
        code: "invalid_request"
      });

      await expect(service.createKey("   ")).rejects.toMatchObject({
        status: 400,
        code: "invalid_request"
      });

      await expect(service.createKey("a".repeat(121))).rejects.toMatchObject({
        status: 400,
        code: "invalid_request"
      });
    });

    it("enforces maxApiKeys capacity limit", async () => {
      const { service } = createService({ maxApiKeys: 2 });

      await service.createKey("key-1");
      await service.createKey("key-2");

      await expect(service.createKey("key-3")).rejects.toMatchObject({
        status: 429,
        code: "capacity_exceeded"
      });
    });
  });

  describe("listKeys", () => {
    it("returns metadata only and never exposes raw secrets or digests", async () => {
      const { service } = createService();
      const key1 = await service.createKey("first");
      await new Promise((resolve) => setTimeout(resolve, 5));
      const key2 = await service.createKey("second");

      const list = await service.listKeys();
      expect(list.length).toBe(2);

      for (const item of list) {
        expect(item).not.toHaveProperty("secret");
        expect(item).not.toHaveProperty("secretDigest");
        expect(item).toHaveProperty("prefix");
        expect(item).toHaveProperty("id");
      }

      expect(list[0]?.id).toBe(key2.id);
      expect(list[1]?.id).toBe(key1.id);
    });

    it("shows revoked_at timestamp for revoked keys", async () => {
      const { service } = createService();
      const key = await service.createKey("revokable");
      await service.revokeKey(key.id);

      const list = await service.listKeys();
      expect(list[0]?.revoked_at).toBeDefined();
    });
  });

  describe("authenticateKey", () => {
    it("authenticates an active key using Authorization: Bearer header", async () => {
      const { service } = createService();
      const created = await service.createKey("active-key");

      const authenticated = await service.authenticateKey(`Bearer ${created.secret}`);
      expect(authenticated.id).toBe(created.id);
      expect(authenticated.name).toBe("active-key");
    });

    it("rejects missing, malformed, or non-bearer header", async () => {
      const { service } = createService();

      await expect(service.authenticateKey(undefined)).rejects.toMatchObject({
        status: 401,
        code: "invalid_api_key"
      });

      await expect(service.authenticateKey("Basic abc")).rejects.toMatchObject({
        status: 401,
        code: "invalid_api_key"
      });

      await expect(service.authenticateKey("Bearer short")).rejects.toMatchObject({
        status: 401,
        code: "invalid_api_key"
      });
    });

    it("rejects unknown API keys", async () => {
      const { service } = createService();
      await expect(
        service.authenticateKey("Bearer sk_1234567890123456789012345678901234567890123")
      ).rejects.toMatchObject({
        status: 401,
        code: "invalid_api_key"
      });
    });

    it("rejects revoked API keys", async () => {
      const { service } = createService();
      const created = await service.createKey("will-revoke");
      await service.revokeKey(created.id);

      await expect(service.authenticateKey(`Bearer ${created.secret}`)).rejects.toMatchObject({
        status: 401,
        code: "invalid_api_key"
      });
    });
  });

  describe("revokeKey", () => {
    it("rejects non-uuid key IDs", async () => {
      const { service } = createService();

      await expect(service.revokeKey("invalid-uuid")).rejects.toMatchObject({
        status: 400,
        code: "invalid_request"
      });
    });

    it("is idempotent on repeated calls", async () => {
      const { service } = createService();
      const key = await service.createKey("idempotent");

      await expect(service.revokeKey(key.id)).resolves.toBeUndefined();
      await expect(service.revokeKey(key.id)).resolves.toBeUndefined();
    });
  });
});
