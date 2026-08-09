import { describe, expect, it, vi } from "vitest";

import {
  createApiKey,
  hashCreateApiKeyRequest,
  type ApiKeyCreationRepository,
  type ApiKeyCreationTransaction,
  type ApiKeySummary
} from "../../src/modules/developer-platform/application/create-api-key.js";

const key: ApiKeySummary = {
  id: "key-2",
  kind: "secret",
  prefix: "sk_abcdefgh",
  scopes: ["projects:read"],
  expiresAt: undefined
};

const command = {
  authenticatedProjectId: "project-1",
  actorKeyId: "key-1",
  targetProjectId: "project-2",
  kind: "secret" as const,
  scopes: ["projects:read"],
  hashKey: "test-api-key-hashing-secret-value",
  correlationId: "request_12345678",
  idempotencyKey: "key-create-123",
  requestHash: hashCreateApiKeyRequest({ kind: "secret", scopes: ["projects:read"] }),
  now: new Date("2026-08-09T00:00:00.000Z")
};

const createRepository = (): {
  repository: ApiKeyCreationRepository;
  transaction: ApiKeyCreationTransaction;
} => {
  const transaction: ApiKeyCreationTransaction = {
    lockIdempotencyScope: async () => undefined,
    findIdempotencyRecord: async () => undefined,
    findDefaultEnvironmentInOrganization: async () => ({
      projectId: "project-2",
      environmentId: "environment-2"
    }),
    createApiKey: async () => key,
    appendAuditEvent: async () => undefined,
    saveIdempotencyRecord: async () => undefined
  };
  return { repository: { transaction: async (operation) => operation(transaction) }, transaction };
};

describe("createApiKey", () => {
  it("creates a hashed key once and appends an audit event", async () => {
    const { repository, transaction } = createRepository();
    const create = vi.spyOn(transaction, "createApiKey");
    const audit = vi.spyOn(transaction, "appendAuditEvent");

    const result = await createApiKey(repository, command);

    expect(result.key).toEqual(key);
    expect(result.rawKey).toMatch(/^sk_[A-Za-z0-9_-]{43}$/);
    expect(result.replayed).toBe(false);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-2",
      environmentId: "environment-2",
      secretHash: expect.any(Buffer),
      scopes: ["projects:read"]
    }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-2", targetId: key.id }));
  });

  it("does not re-reveal a key for a matching idempotent retry", async () => {
    const { repository, transaction } = createRepository();
    transaction.findIdempotencyRecord = async () => ({ requestHash: command.requestHash, key });

    await expect(createApiKey(repository, command)).resolves.toEqual({
      key,
      rawKey: undefined,
      replayed: true
    });
  });

  it("hides projects that are outside the authenticated organization", async () => {
    const { repository, transaction } = createRepository();
    transaction.findDefaultEnvironmentInOrganization = async () => undefined;

    await expect(createApiKey(repository, command)).rejects.toMatchObject({ status: 404, code: "not_found" });
  });
});
