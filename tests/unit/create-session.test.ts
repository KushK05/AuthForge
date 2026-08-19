import { describe, expect, it, vi } from "vitest";

import {
  createSession,
  type SessionCreationRepository,
  type SessionCreationTransaction
} from "../../src/modules/sessions/application/create-session.js";
import { hashRefreshToken } from "../../src/modules/sessions/domain/refresh-token.js";

const command = {
  sessionId: "session-1", projectId: "project-1", userId: "user-1", tokenHashKey: "test-api-key-hashing-secret-value",
  correlationId: "request_12345678", now: new Date("2026-08-11T00:00:00.000Z")
};

const createRepository = (): { repository: SessionCreationRepository; transaction: SessionCreationTransaction } => {
  const transaction: SessionCreationTransaction = {
    createSession: async () => undefined,
    createRefreshTokenFamily: async () => undefined,
    createRefreshToken: async () => undefined,
    appendAuditEvent: async () => undefined
  };
  return { repository: { transaction: async (operation) => operation(transaction) }, transaction };
};

describe("createSession", () => {
  it("creates a session and hashed refresh-token family atomically", async () => {
    const { repository, transaction } = createRepository();
    const createToken = vi.spyOn(transaction, "createRefreshToken");

    const result = await createSession(repository, command);

    expect(result.refreshToken).toMatch(/^rt_[A-Za-z0-9_-]{43}$/);
    expect(result.refreshExpiresAt).toEqual(new Date("2026-09-10T00:00:00.000Z"));
    expect(createToken).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      tokenHash: hashRefreshToken(result.refreshToken, command.tokenHashKey),
      expiresAt: result.refreshExpiresAt
    }));
  });
});
