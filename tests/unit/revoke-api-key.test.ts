import { describe, expect, it, vi } from "vitest";

import type { ApiKeySummary } from "../../src/modules/developer-platform/application/create-api-key.js";
import {
  revokeApiKey,
  type ApiKeyRevocationRepository,
  type ApiKeyRevocationTransaction
} from "../../src/modules/developer-platform/application/revoke-api-key.js";

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
  targetKeyId: "key-2",
  correlationId: "request_12345678",
  idempotencyKey: "key-revoke-123",
  now: new Date("2026-08-09T00:00:00.000Z")
};

const createRepository = (): {
  repository: ApiKeyRevocationRepository;
  transaction: ApiKeyRevocationTransaction;
} => {
  const transaction: ApiKeyRevocationTransaction = {
    lockIdempotencyScope: async () => undefined,
    findIdempotencyRecord: async () => undefined,
    findProjectInOrganization: async () => "project-2",
    findApiKey: async () => key,
    revokeApiKey: async () => true,
    appendAuditEvent: async () => undefined,
    saveIdempotencyRecord: async () => undefined
  };
  return { repository: { transaction: async (operation) => operation(transaction) }, transaction };
};

describe("revokeApiKey", () => {
  it("revokes a same-organization key and appends an audit event", async () => {
    const { repository, transaction } = createRepository();
    const revoke = vi.spyOn(transaction, "revokeApiKey");
    const audit = vi.spyOn(transaction, "appendAuditEvent");

    await expect(revokeApiKey(repository, command)).resolves.toBeUndefined();
    expect(revoke).toHaveBeenCalledWith({ projectId: "project-2", keyId: "key-2", now: command.now });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-2", targetId: "key-2" }));
  });

  it("does not append a duplicate audit event when the key is already revoked", async () => {
    const { repository, transaction } = createRepository();
    transaction.revokeApiKey = async () => false;
    const audit = vi.spyOn(transaction, "appendAuditEvent");

    await revokeApiKey(repository, command);
    expect(audit).not.toHaveBeenCalled();
  });

  it("does not reveal a project outside the authenticated organization", async () => {
    const { repository, transaction } = createRepository();
    transaction.findProjectInOrganization = async () => undefined;

    await expect(revokeApiKey(repository, command)).rejects.toMatchObject({ status: 404, code: "not_found" });
  });
});
