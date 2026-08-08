import type postgres from "postgres";

import type { AuthenticatedSecretApiKey, SecretApiKeyReader } from "../application/authenticate-secret-key.js";
import type {
  DeveloperPlatformRepository,
  DeveloperPlatformTransaction,
  ProjectSummary
} from "../application/create-project.js";

type ProjectRow = Readonly<{ id: string; name: string; status: "active" }>;
type EnvironmentRow = Readonly<{ id: string; name: "development"; issuer: string; audience: string }>;
type IdempotencyRow = Readonly<{ request_hash: Buffer; response_body: ProjectSummary }>;

export class PostgresDeveloperPlatformRepository implements DeveloperPlatformRepository, SecretApiKeyReader {
  public constructor(private readonly sql: postgres.Sql) {}

  public async findActiveSecretApiKey(
    secretHash: Buffer,
    now: Date
  ): Promise<AuthenticatedSecretApiKey | undefined> {
    const [key] = await this.sql<AuthenticatedSecretApiKey[]>`
      SELECT id, project_id AS "projectId", scopes
      FROM api_keys
      WHERE kind = 'secret'
        AND secret_hash = ${secretHash}
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > ${now})
      LIMIT 1
    `;
    return key;
  }

  public transaction<T>(operation: (transaction: DeveloperPlatformTransaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => operation(new PostgresDeveloperPlatformTransaction(sql))) as Promise<T>;
  }
}

class PostgresDeveloperPlatformTransaction implements DeveloperPlatformTransaction {
  public constructor(private readonly sql: postgres.TransactionSql) {}

  public async findOrganizationIdForProject(projectId: string): Promise<string | undefined> {
    const [project] = await this.sql<{ organization_id: string }[]>`
      SELECT organization_id FROM projects WHERE id = ${projectId} AND status = 'active'
    `;
    return project?.organization_id;
  }

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
  }>): Promise<Readonly<{ requestHash: Buffer; project: ProjectSummary }> | undefined> {
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
    return record
      ? { requestHash: record.request_hash, project: record.response_body }
      : undefined;
  }

  public async createProject(input: Readonly<{
    id: string;
    environmentId: string;
    organizationId: string;
    name: string;
    issuer: string;
  }>): Promise<ProjectSummary> {
    const [project] = await this.sql<ProjectRow[]>`
      INSERT INTO projects (id, organization_id, name)
      VALUES (${input.id}, ${input.organizationId}, ${input.name})
      RETURNING id, name, status
    `;
    if (!project) throw new Error("Project insertion did not return a project");
    const issuer = `${input.issuer.replace(/\/$/, "")}/v1/projects/${project.id}`;
    const [environment] = await this.sql<EnvironmentRow[]>`
      INSERT INTO project_environments (id, project_id, name, issuer, audience)
      VALUES (${input.environmentId}, ${project.id}, 'development', ${issuer}, ${input.environmentId})
      RETURNING id, name, issuer, audience
    `;
    if (!environment) throw new Error("Environment insertion did not return an environment");
    return { id: project.id, name: project.name, status: project.status, defaultEnvironment: environment };
  }

  public async saveIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    requestHash: Buffer;
    project: ProjectSummary;
    expiresAt: Date;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO idempotency_records (
        principal_id, project_id, route, idempotency_key, request_hash,
        response_status, response_body, expires_at
      ) VALUES (
        ${input.principalId}, ${input.projectId}, ${input.route}, ${input.key}, ${input.requestHash},
        201, ${this.sql.json(input.project)}, ${input.expiresAt}
      )
    `;
  }

  public async appendAuditEvent(input: Readonly<{
    projectId: string;
    actorId: string;
    action: "developer.project.created";
    targetId: string;
    correlationId: string;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (
        project_id, actor_type, actor_id, action, target_type, target_id, correlation_id
      ) VALUES (
        ${input.projectId}, 'api_key', ${input.actorId}, ${input.action},
        'project', ${input.targetId}, ${input.correlationId}
      )
    `;
  }
}
