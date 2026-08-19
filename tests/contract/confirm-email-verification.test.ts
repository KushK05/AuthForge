import { describe, expect, it } from "vitest";

import { buildApi, type IdentityDependencies } from "../../src/api/app.js";
import type { EmailVerificationRepository, EmailVerificationTransaction } from "../../src/modules/identity/application/confirm-email-verification.js";
import { deriveEmailToken } from "../../src/modules/identity/domain/email-token.js";
import type { AppConfig } from "../../src/platform/config.js";

const config: AppConfig = {
  environment: "test", host: "127.0.0.1", port: 0, logLevel: "error",
  databaseUrl: "postgres://authforge:authforge@localhost:5432/authforge", redisUrl: "redis://localhost:6379",
  awsRegion: "us-east-1", apiKeyHashKey: "test-api-key-hashing-secret-value",
  tokenDerivationKey: "test-token-derivation-key-with-32-bytes", publicIssuerBaseUrl: "http://localhost:8080",
  passwordMinLength: 12, argon2: { memoryKiB: 19_456, iterations: 2, parallelism: 1 }
};

const transaction: EmailVerificationTransaction = {
  findActiveVerificationToken: async () => ({ projectId: "project-1", userId: "user-1" }),
  verifyUserEmail: async () => ({ id: "user-1", status: "active", emailVerifiedAt: "2026-08-10T00:00:00.000Z" }),
  consumeVerificationToken: async () => undefined,
  appendAuditEvent: async () => undefined
};
const repository: EmailVerificationRepository = { transaction: async (operation) => operation(transaction) };
const identity: IdentityDependencies = {
  signUpRepository: {} as IdentityDependencies["signUpRepository"],
  emailVerificationRepository: repository
};

describe("POST /v1/email-verifications/confirm", () => {
  it("returns the verified summary and rejects malformed tokens", async () => {
    const api = buildApi(config, undefined, undefined, identity);
    const confirmed = await api.inject({
      method: "POST",
      url: "/v1/email-verifications/confirm",
      payload: { token: deriveEmailToken("6b1617e4-9a45-4cc9-869e-d9d7d9d3e401", config.tokenDerivationKey) }
    });
    const malformed = await api.inject({
      method: "POST", url: "/v1/email-verifications/confirm", payload: { token: "invalid" }
    });

    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toEqual({ id: "user-1", status: "active", emailVerifiedAt: "2026-08-10T00:00:00.000Z" });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().code).toBe("invalid_request");
    await api.close();
  });
});
