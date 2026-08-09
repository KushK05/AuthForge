import { describe, expect, it, vi } from "vitest";

import {
  normalizeRedirectUrls,
  replaceRedirectUrls,
  type RedirectUrlRepository,
  type RedirectUrlTransaction
} from "../../src/modules/developer-platform/application/replace-redirect-urls.js";

const command = {
  authenticatedProjectId: "project-1",
  actorKeyId: "key-1",
  targetProjectId: "project-2",
  urls: ["HTTPS://Example.COM/callback"],
  environment: "production" as const,
  correlationId: "request_12345678",
  idempotencyKey: "redirect-replace-123",
  now: new Date("2026-08-09T00:00:00.000Z")
};

const createRepository = (): {
  repository: RedirectUrlRepository;
  transaction: RedirectUrlTransaction;
} => {
  const transaction: RedirectUrlTransaction = {
    lockIdempotencyScope: async () => undefined,
    findIdempotencyRecord: async () => undefined,
    findProjectInOrganization: async () => "project-2",
    replaceRedirectUrls: async () => undefined,
    appendAuditEvent: async () => undefined,
    saveIdempotencyRecord: async () => undefined
  };
  return { repository: { transaction: async (operation) => operation(transaction) }, transaction };
};

describe("redirect URL allowlists", () => {
  it("normalizes secure URLs and replaces the allowlist transactionally", async () => {
    const { repository, transaction } = createRepository();
    const replace = vi.spyOn(transaction, "replaceRedirectUrls");

    await expect(replaceRedirectUrls(repository, command)).resolves.toEqual(["https://example.com/callback"]);
    expect(replace).toHaveBeenCalledWith({ projectId: "project-2", urls: ["https://example.com/callback"] });
  });

  it("allows HTTP loopback only in development", () => {
    expect(normalizeRedirectUrls(["http://localhost:3000/callback"], "development")).toEqual([
      "http://localhost:3000/callback"
    ]);
    expect(() => normalizeRedirectUrls(["http://localhost:3000/callback"], "production")).toThrow("HTTPS");
    expect(() => normalizeRedirectUrls(["http://example.com/callback"], "development")).toThrow("HTTPS");
  });

  it("rejects cross-organization targets and duplicate normalized URLs", async () => {
    const { repository, transaction } = createRepository();
    transaction.findProjectInOrganization = async () => undefined;

    await expect(replaceRedirectUrls(repository, command)).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(() => normalizeRedirectUrls(["https://example.com", "https://example.com/"], "production")).toThrow(
      "unique"
    );
  });
});
