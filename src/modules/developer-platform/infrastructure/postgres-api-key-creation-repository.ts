import type postgres from "postgres";

import type { ApiKeyKind } from "../../../shared/crypto/opaque-secret.js";
import type {
  ApiKeyCreationRepository,
  ApiKeyCreationTransaction,
  ApiKeySummary
} from "../application/create-api-key.js";

type IdempotencyRow = Readonly<{ request_hash: Buffer; response_body: ApiKeySummary }>;
type EnvironmentRow = Readonly<{ project_id: string; environment_id: string }>;
type ApiKeyRow = Readonly<{
  id: string;
  kind: ApiKeyKind;
  prefix: string;
  scopes: string[];
  expires_at: Date | null;
}>;

export class PostgresApiKeyCreationRepository implements ApiKeyCreationRepository {
  public constructor(private readonly sql: postgres.Sql) {}

  public transaction<T>(operation: (transaction: ApiKeyCreationTransaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => operation(new PostgresApiKeyCreationTransaction(sql))) as Promise<T>;
  }
}

class PostgresApiKeyCreationTransaction implements ApiKeyCreationTransaction {
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
      SELECT request_hash, response_body
      FROM idempotency_records
      WHERE principal_id = ${input.principalId}
        AND project_id = ${input.projectId}
        AND route = ${input.route}
        AND idempotency_key = ${input.key}
        AND expires_at > ${input.now}
      LIMIT 1
    `;
    return record ? { requestHash: record.request_hash, key: record.response_body } : undefined;
  }

  public async findDefaultEnvironmentInOrganization(input: Readonly<{
    authenticatedProjectId: string;
    targetProjectId: string;
  }>): Promise<Readonly<{ projectId: string; environmentId: string }> | undefined> {
    const [environment] = await this.sql<EnvironmentRow[]>`
      SELECT target.id AS project_id, project_environments.id AS environment_id
      FROM projects AS target
      INNER JOIN projects AS authenticated ON authenticated.id = ${input.authenticatedProjectId}
      INNER JOIN project_environments ON project_environments.project_id = target.id
      WHERE target.id = ${input.targetProjectId}
        AND target.organization_id = authenticated.organization_id
        AND target.status = 'active'
        AND authenticated.status = 'active'
        AND project_environments.name = 'development'
      LIMIT 1
    `;
    return environment
      ? { projectId: environment.project_id, environmentId: environment.environment_id }
      : undefined;
  }

  public async createApiKey(input: Readonly<{
    id: string;
    projectId: string;
    environmentId: string;
    kind: ApiKeyKind;
    secretHash: Buffer;
    prefix: string;
    scopes: readonly string[];
  }>): Promise<ApiKeySummary> {
    const [key] = await this.sql<ApiKeyRow[]>`
      INSERT INTO api_keys (id, project_id, environment_id, kind, secret_hash, prefix, scopes)
      VALUES (
        ${input.id}, ${input.projectId}, ${input.environmentId}, ${input.kind},
        ${input.secretHash}, ${input.prefix}, ${this.sql.array([...input.scopes])}
      )
      RETURNING id, kind, prefix, scopes, expires_at
    `;
    if (!key) throw new Error("API key insertion did not return a key");
    return {
      id: key.id,
      kind: key.kind,
      prefix: key.prefix,
      scopes: key.scopes,
      expiresAt: key.expires_at?.toISOString()
    };
  }

  public async appendAuditEvent(input: Readonly<{
    projectId: string;
    actorId: string;
    action: "developer.api_key.created";
    targetId: string;
    correlationId: string;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (project_id, actor_type, actor_id, action, target_type, target_id, correlation_id)
      VALUES (
        ${input.projectId}, 'api_key', ${input.actorId}, ${input.action},
        'api_key', ${input.targetId}, ${input.correlationId}
      )
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
        principal_id, project_id, route, idempotency_key, request_hash,
        response_status, response_body, expires_at
      ) VALUES (
        ${input.principalId}, ${input.projectId}, ${input.route}, ${input.key}, ${input.requestHash},
        201, ${this.sql.json(input.response)}, ${input.expiresAt}
      )
    `;
  }
}
