import type postgres from "postgres";

import type { ApiKeySummary } from "../application/create-api-key.js";
import type {
  ApiKeyRevocationRepository,
  ApiKeyRevocationTransaction
} from "../application/revoke-api-key.js";

type IdempotencyRow = Readonly<{ request_hash: Buffer; response_body: ApiKeySummary }>;
type ApiKeyRow = Readonly<{
  id: string;
  kind: "secret" | "publishable";
  prefix: string;
  scopes: string[];
  expires_at: Date | null;
}>;

export class PostgresApiKeyRevocationRepository implements ApiKeyRevocationRepository {
  public constructor(private readonly sql: postgres.Sql) {}

  public transaction<T>(operation: (transaction: ApiKeyRevocationTransaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => operation(new PostgresApiKeyRevocationTransaction(sql))) as Promise<T>;
  }
}

class PostgresApiKeyRevocationTransaction implements ApiKeyRevocationTransaction {
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

  public async findIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    now: Date;
  }>): Promise<Readonly<{ requestHash: Buffer; key: ApiKeySummary }> | undefined> {
    const [record] = await this.sql<IdempotencyRow[]>`
      SELECT request_hash, response_body FROM idempotency_records
      WHERE principal_id = ${input.principalId} AND project_id = ${input.projectId}
        AND route = ${input.route} AND idempotency_key = ${input.key} AND expires_at > ${input.now}
      LIMIT 1
    `;
    return record ? { requestHash: record.request_hash, key: record.response_body } : undefined;
  }

  public async findProjectInOrganization(input: Readonly<{
    authenticatedProjectId: string;
    targetProjectId: string;
  }>): Promise<string | undefined> {
    const [project] = await this.sql<{ id: string }[]>`
      SELECT target.id
      FROM projects AS target
      INNER JOIN projects AS authenticated ON authenticated.id = ${input.authenticatedProjectId}
      WHERE target.id = ${input.targetProjectId}
        AND target.organization_id = authenticated.organization_id
        AND target.status = 'active' AND authenticated.status = 'active'
      LIMIT 1
    `;
    return project?.id;
  }

  public async findApiKey(input: Readonly<{ projectId: string; keyId: string }>): Promise<ApiKeySummary | undefined> {
    const [key] = await this.sql<ApiKeyRow[]>`
      SELECT id, kind, prefix, scopes, expires_at FROM api_keys
      WHERE id = ${input.keyId} AND project_id = ${input.projectId}
      LIMIT 1
    `;
    return key
      ? { id: key.id, kind: key.kind, prefix: key.prefix, scopes: key.scopes, expiresAt: key.expires_at?.toISOString() }
      : undefined;
  }

  public async revokeApiKey(input: Readonly<{ projectId: string; keyId: string; now: Date }>): Promise<boolean> {
    const revoked = await this.sql`
      UPDATE api_keys SET revoked_at = ${input.now}, updated_at = ${input.now}
      WHERE id = ${input.keyId} AND project_id = ${input.projectId} AND revoked_at IS NULL
      RETURNING id
    `;
    return revoked.length === 1;
  }

  public async appendAuditEvent(input: Readonly<{
    projectId: string;
    actorId: string;
    action: "developer.api_key.revoked";
    targetId: string;
    correlationId: string;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (project_id, actor_type, actor_id, action, target_type, target_id, correlation_id)
      VALUES (${input.projectId}, 'api_key', ${input.actorId}, ${input.action}, 'api_key', ${input.targetId}, ${input.correlationId})
    `;
  }

  public async saveIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    requestHash: Buffer;
    response: ApiKeySummary;
    expiresAt: Date;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO idempotency_records (
        principal_id, project_id, route, idempotency_key, request_hash, response_status, response_body, expires_at
      ) VALUES (
        ${input.principalId}, ${input.projectId}, ${input.route}, ${input.key}, ${input.requestHash},
        204, ${this.sql.json(input.response)}, ${input.expiresAt}
      )
    `;
  }
}
