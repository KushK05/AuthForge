import { describe, expect, it, vi } from "vitest";

import {
  confirmEmailVerification,
  type EmailVerificationRepository,
  type EmailVerificationTransaction
} from "../../src/modules/identity/application/confirm-email-verification.js";
import { deriveEmailToken, hashEmailToken } from "../../src/modules/identity/domain/email-token.js";

const tokenId = "6b1617e4-9a45-4cc9-869e-d9d7d9d3e401";
const tokenDerivationKey = "test-token-derivation-key-with-32-bytes";
const token = deriveEmailToken(tokenId, tokenDerivationKey);
const command = {
  token,
  tokenDerivationKey,
  correlationId: "request_12345678",
  now: new Date("2026-08-10T00:00:00.000Z")
};

const createRepository = (): { repository: EmailVerificationRepository; transaction: EmailVerificationTransaction } => {
  const transaction: EmailVerificationTransaction = {
    findActiveVerificationToken: async () => ({ projectId: "project-1", userId: "user-1" }),
    verifyUserEmail: async () => ({
      id: "user-1",
      status: "active",
      emailVerifiedAt: "2026-08-10T00:00:00.000Z"
    }),
    consumeVerificationToken: async () => undefined,
    appendAuditEvent: async () => undefined
  };
  return { repository: { transaction: async (operation) => operation(transaction) }, transaction };
};

describe("confirmEmailVerification", () => {
  it("hash-checks and consumes a token while activating its project-scoped user", async () => {
    const { repository, transaction } = createRepository();
    const findToken = vi.spyOn(transaction, "findActiveVerificationToken");
    const consume = vi.spyOn(transaction, "consumeVerificationToken");
    const audit = vi.spyOn(transaction, "appendAuditEvent");

    await expect(confirmEmailVerification(repository, command)).resolves.toEqual({
      id: "user-1",
      status: "active",
      emailVerifiedAt: "2026-08-10T00:00:00.000Z"
    });
    expect(findToken).toHaveBeenCalledWith({
      tokenId,
      tokenHash: hashEmailToken(token, tokenDerivationKey),
      now: command.now
    });
    expect(consume).toHaveBeenCalledWith({ tokenId, projectId: "project-1", userId: "user-1", now: command.now });
    expect(audit).toHaveBeenCalledWith({
      projectId: "project-1",
      action: "identity.email.verified",
      targetId: "user-1",
      correlationId: command.correlationId
    });
  });

  it("fails safely when the token is unknown, expired, or consumed", async () => {
    const { repository, transaction } = createRepository();
    transaction.findActiveVerificationToken = async () => undefined;

    await expect(confirmEmailVerification(repository, command)).rejects.toMatchObject({
      status: 400,
      code: "invalid_request"
    });
  });
});
