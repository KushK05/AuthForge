import type postgres from "postgres";

import type {
  RedirectUrlRepository,
  RedirectUrlTransaction
} from "../application/replace-redirect-urls.js";

type IdempotencyRow = Readonly<{ request_hash: Buffer; response_body: { urls: string[] } }>;

export class PostgresRedirectUrlRepository implements RedirectUrlRepository {
  public constructor(private readonly sql: postgres.Sql) {}

  public transaction<T>(operation: (transaction: RedirectUrlTransaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => operation(new PostgresRedirectUrlTransaction(sql))) as Promise<T>;
  }
}

class PostgresRedirectUrlTransaction implements RedirectUrlTransaction {
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
  }>): Promise<Readonly<{ requestHash: Buffer; urls: readonly string[] }> | undefined> {
    const [record] = await this.sql<IdempotencyRow[]>`
      SELECT request_hash, response_body FROM idempotency_records
      WHERE principal_id = ${input.principalId} AND project_id = ${input.projectId}
        AND route = ${input.route} AND idempotency_key = ${input.key} AND expires_at > ${input.now}
      LIMIT 1
    `;
    return record ? { requestHash: record.request_hash, urls: record.response_body.urls } : undefined;
  }

  public async findProjectInOrganization(input: Readonly<{
    authenticatedProjectId: string;
    targetProjectId: string;
  }>): Promise<string | undefined> {
    const [project] = await this.sql<{ id: string }[]>`
      SELECT target.id FROM projects AS target
      INNER JOIN projects AS authenticated ON authenticated.id = ${input.authenticatedProjectId}
      WHERE target.id = ${input.targetProjectId}
        AND target.organization_id = authenticated.organization_id
        AND target.status = 'active' AND authenticated.status = 'active'
      LIMIT 1
    `;
    return project?.id;
  }

  public async replaceRedirectUrls(input: Readonly<{ projectId: string; urls: readonly string[] }>): Promise<void> {
    await this.sql`DELETE FROM redirect_urls WHERE project_id = ${input.projectId}`;
    if (input.urls.length === 0) return;
    await this.sql`
      INSERT INTO redirect_urls (project_id, url)
      SELECT ${input.projectId}, url FROM unnest(${this.sql.array([...input.urls])}::text[]) AS url
    `;
  }

  public async appendAuditEvent(input: Readonly<{
    projectId: string;
    actorId: string;
    action: "developer.redirect_urls.replaced";
    correlationId: string;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (project_id, actor_type, actor_id, action, target_type, correlation_id)
      VALUES (${input.projectId}, 'api_key', ${input.actorId}, ${input.action}, 'redirect_url_allowlist', ${input.correlationId})
    `;
  }

  public async saveIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    requestHash: Buffer;
    urls: readonly string[];
    expiresAt: Date;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO idempotency_records (
        principal_id, project_id, route, idempotency_key, request_hash, response_status, response_body, expires_at
      ) VALUES (
        ${input.principalId}, ${input.projectId}, ${input.route}, ${input.key}, ${input.requestHash},
        200, ${this.sql.json({ urls: input.urls })}, ${input.expiresAt}
      )
    `;
  }
}
