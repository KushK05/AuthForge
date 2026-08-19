import type postgres from "postgres";

import type { SessionCreationRepository, SessionCreationTransaction } from "../application/create-session.js";

export class PostgresSessionCreationRepository implements SessionCreationRepository {
  public constructor(private readonly sql: postgres.Sql) {}

  public transaction<T>(operation: (transaction: SessionCreationTransaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => operation(new PostgresSessionCreationTransaction(sql))) as Promise<T>;
  }
}

class PostgresSessionCreationTransaction implements SessionCreationTransaction {
  public constructor(private readonly sql: postgres.TransactionSql) {}

  public async createSession(input: Readonly<{
    id: string;
    projectId: string;
    userId: string;
    now: Date;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO sessions (id, project_id, user_id, created_at, last_seen_at)
      VALUES (${input.id}, ${input.projectId}, ${input.userId}, ${input.now}, ${input.now})
    `;
  }

  public async createRefreshTokenFamily(input: Readonly<{
    id: string;
    projectId: string;
    userId: string;
    sessionId: string;
    absoluteExpiresAt: Date;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO refresh_token_families (id, project_id, user_id, session_id, absolute_expires_at)
      VALUES (${input.id}, ${input.projectId}, ${input.userId}, ${input.sessionId}, ${input.absoluteExpiresAt})
    `;
  }

  public async createRefreshToken(input: Readonly<{
    id: string;
    projectId: string;
    familyId: string;
    tokenHash: Buffer;
    expiresAt: Date;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO refresh_tokens (id, project_id, family_id, token_hash, expires_at)
      VALUES (${input.id}, ${input.projectId}, ${input.familyId}, ${input.tokenHash}, ${input.expiresAt})
    `;
  }

  public async appendAuditEvent(input: Readonly<{
    projectId: string;
    userId: string;
    action: "sessions.session.created";
    sessionId: string;
    correlationId: string;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (project_id, actor_type, actor_id, action, target_type, target_id, correlation_id)
      VALUES (
        ${input.projectId}, 'user', ${input.userId}, ${input.action},
        'session', ${input.sessionId}, ${input.correlationId}
      )
    `;
  }
}
