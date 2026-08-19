import { describe, expect, it, vi } from "vitest";

import { deriveEmailToken, hashEmailToken } from "../../src/modules/identity/domain/email-token.js";
import {
  hashSignUpRequest,
  signUp,
  type SignUpCommand,
  type SignUpRepository,
  type SignUpTransaction
} from "../../src/modules/identity/application/sign-up.js";

const command: SignUpCommand = {
  authenticatedProjectId: "project-1",
  actorKeyId: "publishable-key-1",
  email: "  Person@Example.test ",
  password: "this password is long enough",
  redirectUrl: "https://app.example.test/verified",
  correlationId: "request_12345678",
  idempotencyKey: "sign-up-123",
  requestHash: hashSignUpRequest({
    email: "  Person@Example.test ",
    password: "this password is long enough",
    redirectUrl: "https://app.example.test/verified"
  }, "test-api-key-hashing-secret-value"),
  tokenDerivationKey: "test-token-derivation-key-with-32-bytes",
  passwordMinimumLength: 12,
  argon2: { memoryKiB: 19_456, iterations: 2, parallelism: 1 },
  now: new Date("2026-08-09T00:00:00.000Z")
};

const createRepository = (): { repository: SignUpRepository; transaction: SignUpTransaction } => {
  let idempotencyRecord: Readonly<{ requestHash: Buffer; response: { status: "pending_verification" } }> | undefined;
  const transaction: SignUpTransaction = {
    lockIdempotencyScope: async () => undefined,
    lockEmailScope: async () => undefined,
    findIdempotencyRecord: async () => idempotencyRecord,
    findUserIdByEmail: async () => undefined,
    createUser: async () => undefined,
    createVerificationToken: async () => undefined,
    appendAuditEvent: async () => undefined,
    appendOutboxEvent: async () => undefined,
    saveIdempotencyRecord: async (input) => {
      idempotencyRecord = { requestHash: input.requestHash, response: input.response };
    }
  };
  return { repository: { transaction: async (operation) => operation(transaction) }, transaction };
};

describe("signUp", () => {
  it("creates a project-scoped user, hashed token, audit event, and non-secret outbox message", async () => {
    const { repository, transaction } = createRepository();
    const createUser = vi.spyOn(transaction, "createUser");
    const createToken = vi.spyOn(transaction, "createVerificationToken");
    const appendOutbox = vi.spyOn(transaction, "appendOutboxEvent");

    await expect(signUp(repository, command)).resolves.toEqual({ status: "pending_verification" });

    expect(createUser).toHaveBeenCalledWith({
      id: expect.any(String),
      projectId: "project-1",
      normalizedEmail: "person@example.test",
      passwordHash: expect.stringMatching(/^\$argon2id\$/)
    });
    const tokenInput = createToken.mock.calls[0]?.[0];
    expect(tokenInput).toMatchObject({
      id: expect.any(String),
      projectId: "project-1",
      userId: expect.any(String),
      expiresAt: new Date("2026-08-10T00:00:00.000Z")
    });
    expect(tokenInput?.tokenHash).toEqual(
      hashEmailToken(
        deriveEmailToken(tokenInput?.id ?? "", command.tokenDerivationKey),
        command.tokenDerivationKey
      )
    );
    expect(appendOutbox).toHaveBeenCalledWith({
      id: expect.any(String),
      eventType: "identity.email_verification.requested",
      eventVersion: 1,
      projectId: "project-1",
      correlationId: command.correlationId,
      payload: {
        token_id: tokenInput?.id,
        user_id: tokenInput?.userId,
        redirect_url: command.redirectUrl
      }
    });
    expect(JSON.stringify(appendOutbox.mock.calls)).not.toContain(command.password);
  });

  it("replays a matching idempotent request without duplicating the user or email", async () => {
    const { repository, transaction } = createRepository();
    const createUser = vi.spyOn(transaction, "createUser");

    await signUp(repository, command);
    await expect(signUp(repository, command)).resolves.toEqual({ status: "pending_verification" });

    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it("does not disclose an existing email or queue another verification message", async () => {
    const { repository, transaction } = createRepository();
    transaction.findUserIdByEmail = async () => "existing-user";
    const createUser = vi.spyOn(transaction, "createUser");
    const appendOutbox = vi.spyOn(transaction, "appendOutboxEvent");

    await expect(signUp(repository, command)).resolves.toEqual({ status: "pending_verification" });

    expect(createUser).not.toHaveBeenCalled();
    expect(appendOutbox).not.toHaveBeenCalled();
  });
});
