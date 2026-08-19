import { invalidRequest } from "../../../shared/application/errors.js";
import { hashEmailToken } from "../domain/email-token.js";

export type VerifiedUserSummary = Readonly<{
  id: string;
  status: "active";
  emailVerifiedAt: string;
}>;

export type ConfirmEmailVerificationCommand = Readonly<{
  token: string;
  tokenDerivationKey: string;
  correlationId: string;
  now: Date;
}>;

export interface EmailVerificationTransaction {
  findActiveVerificationToken(input: Readonly<{
    tokenId: string;
    tokenHash: Buffer;
    now: Date;
  }>): Promise<Readonly<{ projectId: string; userId: string }> | undefined>;
  verifyUserEmail(input: Readonly<{
    projectId: string;
    userId: string;
    now: Date;
  }>): Promise<VerifiedUserSummary | undefined>;
  consumeVerificationToken(input: Readonly<{
    tokenId: string;
    projectId: string;
    userId: string;
    now: Date;
  }>): Promise<void>;
  appendAuditEvent(input: Readonly<{
    projectId: string;
    action: "identity.email.verified";
    targetId: string;
    correlationId: string;
  }>): Promise<void>;
}

export interface EmailVerificationRepository {
  transaction<T>(operation: (transaction: EmailVerificationTransaction) => Promise<T>): Promise<T>;
}

const tokenPattern = /^v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[A-Za-z0-9_-]{43}$/i;

const extractTokenId = (token: string): string => {
  const tokenId = tokenPattern.exec(token)?.[1];
  if (!tokenId) throw invalidRequest("Invalid or expired verification token");
  return tokenId;
};

export const confirmEmailVerification = async (
  repository: EmailVerificationRepository,
  command: ConfirmEmailVerificationCommand
): Promise<VerifiedUserSummary> =>
  repository.transaction(async (transaction) => {
    const tokenId = extractTokenId(command.token);
    const token = await transaction.findActiveVerificationToken({
      tokenId,
      tokenHash: hashEmailToken(command.token, command.tokenDerivationKey),
      now: command.now
    });
    if (!token) throw invalidRequest("Invalid or expired verification token");

    const user = await transaction.verifyUserEmail({
      projectId: token.projectId,
      userId: token.userId,
      now: command.now
    });
    if (!user) throw invalidRequest("Invalid or expired verification token");
    await transaction.consumeVerificationToken({
      tokenId,
      projectId: token.projectId,
      userId: token.userId,
      now: command.now
    });
    await transaction.appendAuditEvent({
      projectId: token.projectId,
      action: "identity.email.verified",
      targetId: token.userId,
      correlationId: command.correlationId
    });
    return user;
  });
