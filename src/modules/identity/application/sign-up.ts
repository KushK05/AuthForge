import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { idempotencyKeyReused } from "../../../shared/application/errors.js";
import { deriveEmailToken, hashEmailToken } from "../domain/email-token.js";
import { hashPassword, type Argon2Parameters, validatePassword } from "../domain/password.js";

export type SignUpResponse = Readonly<{ status: "pending_verification" }>;

export type SignUpCommand = Readonly<{
  authenticatedProjectId: string;
  actorKeyId: string;
  email: string;
  password: string;
  redirectUrl: string | undefined;
  correlationId: string;
  idempotencyKey: string;
  requestHash: Buffer;
  tokenDerivationKey: string;
  passwordMinimumLength: number;
  argon2: Argon2Parameters;
  now: Date;
}>;

export interface SignUpTransaction {
  lockIdempotencyScope(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
  }>): Promise<void>;
  lockEmailScope(input: Readonly<{ projectId: string; normalizedEmail: string }>): Promise<void>;
  findIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    now: Date;
  }>): Promise<Readonly<{ requestHash: Buffer; response: SignUpResponse }> | undefined>;
  findUserIdByEmail(input: Readonly<{ projectId: string; normalizedEmail: string }>): Promise<string | undefined>;
  createUser(input: Readonly<{
    id: string;
    projectId: string;
    normalizedEmail: string;
    passwordHash: string;
  }>): Promise<void>;
  createVerificationToken(input: Readonly<{
    id: string;
    projectId: string;
    userId: string;
    tokenHash: Buffer;
    expiresAt: Date;
  }>): Promise<void>;
  appendAuditEvent(input: Readonly<{
    projectId: string;
    actorId: string;
    action: "identity.user.signed_up";
    targetId: string;
    correlationId: string;
  }>): Promise<void>;
  appendOutboxEvent(input: Readonly<{
    id: string;
    eventType: "identity.email_verification.requested";
    eventVersion: 1;
    projectId: string;
    correlationId: string;
    payload: Readonly<{ token_id: string; user_id: string; redirect_url: string | undefined }>;
  }>): Promise<void>;
  saveIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    requestHash: Buffer;
    response: SignUpResponse;
    expiresAt: Date;
  }>): Promise<void>;
}

export interface SignUpRepository {
  transaction<T>(operation: (transaction: SignUpTransaction) => Promise<T>): Promise<T>;
}

const response: SignUpResponse = { status: "pending_verification" };
const idempotencyRoute = "/v1/sign-ups";
const verificationTokenLifetimeMs = 24 * 60 * 60 * 1_000;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const hashSignUpRequest = (input: Readonly<{
  email: string;
  password: string;
  redirectUrl: string | undefined;
}>, requestHashKey: string): Buffer =>
  createHmac("sha256", requestHashKey)
    .update(JSON.stringify({ email: normalizeEmail(input.email), password: input.password, redirect_url: input.redirectUrl }))
    .digest();

export const signUp = async (repository: SignUpRepository, command: SignUpCommand): Promise<SignUpResponse> => {
  validatePassword(command.password, command.passwordMinimumLength);
  const normalizedEmail = normalizeEmail(command.email);

  return repository.transaction(async (transaction) => {
    const scope = {
      principalId: command.actorKeyId,
      projectId: command.authenticatedProjectId,
      route: idempotencyRoute,
      key: command.idempotencyKey
    };
    await transaction.lockIdempotencyScope(scope);
    const prior = await transaction.findIdempotencyRecord({ ...scope, now: command.now });
    if (prior) {
      if (
        prior.requestHash.byteLength !== command.requestHash.byteLength ||
        !timingSafeEqual(prior.requestHash, command.requestHash)
      ) {
        throw idempotencyKeyReused();
      }
      return prior.response;
    }

    await transaction.lockEmailScope({ projectId: command.authenticatedProjectId, normalizedEmail });
    const existingUserId = await transaction.findUserIdByEmail({
      projectId: command.authenticatedProjectId,
      normalizedEmail
    });
    if (!existingUserId) {
      const userId = randomUUID();
      const tokenId = randomUUID();
      const passwordHash = await hashPassword(command.password, command.argon2);
      const tokenHash = hashEmailToken(deriveEmailToken(tokenId, command.tokenDerivationKey), command.tokenDerivationKey);

      await transaction.createUser({
        id: userId,
        projectId: command.authenticatedProjectId,
        normalizedEmail,
        passwordHash
      });
      await transaction.createVerificationToken({
        id: tokenId,
        projectId: command.authenticatedProjectId,
        userId,
        tokenHash,
        expiresAt: new Date(command.now.getTime() + verificationTokenLifetimeMs)
      });
      await transaction.appendAuditEvent({
        projectId: command.authenticatedProjectId,
        actorId: command.actorKeyId,
        action: "identity.user.signed_up",
        targetId: userId,
        correlationId: command.correlationId
      });
      await transaction.appendOutboxEvent({
        id: randomUUID(),
        eventType: "identity.email_verification.requested",
        eventVersion: 1,
        projectId: command.authenticatedProjectId,
        correlationId: command.correlationId,
        payload: { token_id: tokenId, user_id: userId, redirect_url: command.redirectUrl }
      });
    }

    await transaction.saveIdempotencyRecord({
      ...scope,
      requestHash: command.requestHash,
      response,
      expiresAt: new Date(command.now.getTime() + 24 * 60 * 60 * 1_000)
    });
    return response;
  });
};
