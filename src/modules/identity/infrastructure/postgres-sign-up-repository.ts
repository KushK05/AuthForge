import type postgres from "postgres";

import type {
  SignUpRepository,
  SignUpResponse,
  SignUpTransaction
} from "../application/sign-up.js";

type IdempotencyRow = Readonly<{ request_hash: Buffer; response_body: SignUpResponse }>;

export class PostgresSignUpRepository implements SignUpRepository {
  public constructor(private readonly sql: postgres.Sql) {}

  public transaction<T>(operation: (transaction: SignUpTransaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => operation(new PostgresSignUpTransaction(sql))) as Promise<T>;
  }
}

class PostgresSignUpTransaction implements SignUpTransaction {
  public constructor(private readonly sql: postgres.TransactionSql) {}

  public async lockIdempotencyScope(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
  }>): Promise<void> {
    await this.sql`
      SELECT pg_advisory_xact_lock(hashtext(${`${input.principalId}:${input.projectId}:${input.route}:${input.key}`}))
    `;
  }

  public async lockEmailScope(input: Readonly<{ projectId: string; normalizedEmail: string }>): Promise<void> {
    await this.sql`
      SELECT pg_advisory_xact_lock(hashtext(${`${input.projectId}:${input.normalizedEmail}`}))
    `;
  }

  public async findIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    now: Date;
  }>): Promise<Readonly<{ requestHash: Buffer; response: SignUpResponse }> | undefined> {
    const [record] = await this.sql<IdempotencyRow[]>`
      SELECT request_hash, response_body
      FROM idempotency_records
      WHERE principal_id = ${input.principalId}
        AND project_id = ${input.projectId}
        AND route = ${input.route}
        AND idempotency_key = ${input.key}
        AND expires_at > ${input.now}
      LIMIT 1
    `;
    return record ? { requestHash: record.request_hash, response: record.response_body } : undefined;
  }

  public async findUserIdByEmail(input: Readonly<{
    projectId: string;
    normalizedEmail: string;
  }>): Promise<string | undefined> {
    const [user] = await this.sql<{ id: string }[]>`
      SELECT id FROM users
      WHERE project_id = ${input.projectId} AND primary_email_normalized = ${input.normalizedEmail}
      LIMIT 1
    `;
    return user?.id;
  }

  public async createUser(input: Readonly<{
    id: string;
    projectId: string;
    normalizedEmail: string;
    passwordHash: string;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO users (id, project_id, primary_email_normalized, password_hash)
      VALUES (${input.id}, ${input.projectId}, ${input.normalizedEmail}, ${input.passwordHash})
    `;
  }

  public async createVerificationToken(input: Readonly<{
    id: string;
    projectId: string;
    userId: string;
    tokenHash: Buffer;
    expiresAt: Date;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO verification_tokens (id, project_id, user_id, token_hash, expires_at)
      VALUES (${input.id}, ${input.projectId}, ${input.userId}, ${input.tokenHash}, ${input.expiresAt})
    `;
  }

  public async appendAuditEvent(input: Readonly<{
    projectId: string;
    actorId: string;
    action: "identity.user.signed_up";
    targetId: string;
    correlationId: string;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (project_id, actor_type, actor_id, action, target_type, target_id, correlation_id)
      VALUES (
        ${input.projectId}, 'api_key', ${input.actorId}, ${input.action},
        'user', ${input.targetId}, ${input.correlationId}
      )
    `;
  }

  public async appendOutboxEvent(input: Readonly<{
    id: string;
    eventType: "identity.email_verification.requested";
    eventVersion: 1;
    projectId: string;
    correlationId: string;
    payload: Readonly<{ token_id: string; user_id: string; redirect_url: string | undefined }>;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO outbox_events (id, event_type, event_version, project_id, correlation_id, payload)
      VALUES (
        ${input.id}, ${input.eventType}, ${input.eventVersion}, ${input.projectId}, ${input.correlationId},
        ${this.sql.json(input.payload)}
      )
    `;
  }

  public async saveIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    requestHash: Buffer;
    response: SignUpResponse;
    expiresAt: Date;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO idempotency_records (
        principal_id, project_id, route, idempotency_key, request_hash,
        response_status, response_body, expires_at
      ) VALUES (
        ${input.principalId}, ${input.projectId}, ${input.route}, ${input.key}, ${input.requestHash},
        202, ${this.sql.json(input.response)}, ${input.expiresAt}
      )
    `;
  }
}
