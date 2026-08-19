import type postgres from "postgres";

import type {
  EmailVerificationRepository,
  EmailVerificationTransaction,
  VerifiedUserSummary
} from "../application/confirm-email-verification.js";

type VerificationTokenRow = Readonly<{ project_id: string; user_id: string }>;
type VerifiedUserRow = Readonly<{ id: string; email_verified_at: Date }>;

export class PostgresEmailVerificationRepository implements EmailVerificationRepository {
  public constructor(private readonly sql: postgres.Sql) {}

  public transaction<T>(operation: (transaction: EmailVerificationTransaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => operation(new PostgresEmailVerificationTransaction(sql))) as Promise<T>;
  }
}

class PostgresEmailVerificationTransaction implements EmailVerificationTransaction {
  public constructor(private readonly sql: postgres.TransactionSql) {}

  public async findActiveVerificationToken(input: Readonly<{
    tokenId: string;
    tokenHash: Buffer;
    now: Date;
  }>): Promise<Readonly<{ projectId: string; userId: string }> | undefined> {
    const [token] = await this.sql<VerificationTokenRow[]>`
      SELECT project_id, user_id
      FROM verification_tokens
      WHERE id = ${input.tokenId}
        AND token_hash = ${input.tokenHash}
        AND consumed_at IS NULL
        AND expires_at > ${input.now}
      FOR UPDATE
    `;
    return token ? { projectId: token.project_id, userId: token.user_id } : undefined;
  }

  public async verifyUserEmail(input: Readonly<{
    projectId: string;
    userId: string;
    now: Date;
  }>): Promise<VerifiedUserSummary | undefined> {
    const [user] = await this.sql<VerifiedUserRow[]>`
      UPDATE users
      SET email_verified_at = ${input.now}, status = 'active', updated_at = ${input.now}
      WHERE id = ${input.userId}
        AND project_id = ${input.projectId}
        AND status = 'pending_verification'
      RETURNING id, email_verified_at
    `;
    return user
      ? { id: user.id, status: "active", emailVerifiedAt: user.email_verified_at.toISOString() }
      : undefined;
  }

  public async consumeVerificationToken(input: Readonly<{
    tokenId: string;
    projectId: string;
    userId: string;
    now: Date;
  }>): Promise<void> {
    await this.sql`
      UPDATE verification_tokens
      SET consumed_at = ${input.now}
      WHERE id = ${input.tokenId}
        AND project_id = ${input.projectId}
        AND user_id = ${input.userId}
        AND consumed_at IS NULL
    `;
  }

  public async appendAuditEvent(input: Readonly<{
    projectId: string;
    action: "identity.email.verified";
    targetId: string;
    correlationId: string;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (project_id, actor_type, action, target_type, target_id, correlation_id)
      VALUES (${input.projectId}, 'system', ${input.action}, 'user', ${input.targetId}, ${input.correlationId})
    `;
  }
}
