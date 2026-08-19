import { randomUUID } from "node:crypto";

import { generateRefreshToken, hashRefreshToken } from "../domain/refresh-token.js";

export type CreatedSession = Readonly<{
  sessionId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}>;

export type CreateSessionCommand = Readonly<{
  sessionId: string;
  projectId: string;
  userId: string;
  tokenHashKey: string;
  correlationId: string;
  now: Date;
}>;

export interface SessionCreationTransaction {
  createSession(input: Readonly<{ id: string; projectId: string; userId: string; now: Date }>): Promise<void>;
  createRefreshTokenFamily(input: Readonly<{
    id: string;
    projectId: string;
    userId: string;
    sessionId: string;
    absoluteExpiresAt: Date;
  }>): Promise<void>;
  createRefreshToken(input: Readonly<{
    id: string;
    projectId: string;
    familyId: string;
    tokenHash: Buffer;
    expiresAt: Date;
  }>): Promise<void>;
  appendAuditEvent(input: Readonly<{
    projectId: string;
    userId: string;
    action: "sessions.session.created";
    sessionId: string;
    correlationId: string;
  }>): Promise<void>;
}

export interface SessionCreationRepository {
  transaction<T>(operation: (transaction: SessionCreationTransaction) => Promise<T>): Promise<T>;
}

const refreshTokenLifetimeMs = 30 * 24 * 60 * 60 * 1_000;
const refreshFamilyLifetimeMs = 90 * 24 * 60 * 60 * 1_000;

export const createSession = async (
  repository: SessionCreationRepository,
  command: CreateSessionCommand
): Promise<CreatedSession> =>
  repository.transaction(async (transaction) => {
    const sessionId = command.sessionId;
    const familyId = randomUUID();
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(command.now.getTime() + refreshTokenLifetimeMs);
    await transaction.createSession({ id: sessionId, projectId: command.projectId, userId: command.userId, now: command.now });
    await transaction.createRefreshTokenFamily({
      id: familyId,
      projectId: command.projectId,
      userId: command.userId,
      sessionId,
      absoluteExpiresAt: new Date(command.now.getTime() + refreshFamilyLifetimeMs)
    });
    await transaction.createRefreshToken({
      id: randomUUID(),
      projectId: command.projectId,
      familyId,
      tokenHash: hashRefreshToken(refreshToken, command.tokenHashKey),
      expiresAt: refreshExpiresAt
    });
    await transaction.appendAuditEvent({
      projectId: command.projectId,
      userId: command.userId,
      action: "sessions.session.created",
      sessionId,
      correlationId: command.correlationId
    });
    return { sessionId, refreshToken, refreshExpiresAt };
  });
