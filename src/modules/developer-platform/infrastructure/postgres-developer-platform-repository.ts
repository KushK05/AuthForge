import type postgres from "postgres";

import type { AuthenticatedSecretApiKey, SecretApiKeyReader } from "../application/authenticate-secret-key.js";
import type {
  AuthenticatedPublishableApiKey,
  PublishableApiKeyReader
} from "../application/authenticate-publishable-key.js";
import type {
  DeveloperPlatformRepository,
  DeveloperPlatformTransaction,
  ProjectSummary
} from "../application/create-project.js";
import type { ProjectListReader, ProjectPage } from "../application/list-projects.js";
import type { RedirectUrlReader } from "../application/redirect-url-reader.js";
import type { ProjectEnvironment, ProjectEnvironmentReader } from "../application/project-environment-reader.js";

type ProjectRow = Readonly<{ id: string; name: string; status: "active" }>;
type EnvironmentRow = Readonly<{ id: string; name: "development"; issuer: string; audience: string }>;
type IdempotencyRow = Readonly<{ request_hash: Buffer; response_body: ProjectSummary }>;

type ProjectListRow = Readonly<{
  id: string;
  name: string;
  status: "active";
  environment_id: string;
  environment_name: "development";
  issuer: string;
  audience: string;
}>;

export class PostgresDeveloperPlatformRepository
  implements DeveloperPlatformRepository, SecretApiKeyReader, PublishableApiKeyReader, ProjectListReader, RedirectUrlReader, ProjectEnvironmentReader {
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

  public async findActivePublishableApiKey(
    secretHash: Buffer,
    now: Date
  ): Promise<AuthenticatedPublishableApiKey | undefined> {
    const [key] = await this.sql<AuthenticatedPublishableApiKey[]>`
      SELECT api_keys.id, api_keys.project_id AS "projectId"
      FROM api_keys
      INNER JOIN projects ON projects.id = api_keys.project_id
      WHERE api_keys.kind = 'publishable'
        AND api_keys.secret_hash = ${secretHash}
        AND api_keys.revoked_at IS NULL
        AND (api_keys.expires_at IS NULL OR api_keys.expires_at > ${now})
        AND projects.status = 'active'
      LIMIT 1
    `;
    return key;
  }

  public async hasRedirectUrl(input: Readonly<{ projectId: string; url: string }>): Promise<boolean> {
    const [redirectUrl] = await this.sql<{ id: string }[]>`
      SELECT id FROM redirect_urls
      WHERE project_id = ${input.projectId} AND url = ${input.url}
      LIMIT 1
    `;
    return redirectUrl !== undefined;
  }

  public async findDefaultEnvironment(projectId: string): Promise<ProjectEnvironment | undefined> {
    const [environment] = await this.sql<ProjectEnvironment[]>`
      SELECT issuer, audience
      FROM project_environments
      WHERE project_id = ${projectId} AND name = 'development'
      LIMIT 1
    `;
    return environment;
  }

  public transaction<T>(operation: (transaction: DeveloperPlatformTransaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => operation(new PostgresDeveloperPlatformTransaction(sql))) as Promise<T>;
  }

  public async listProjects(input: Readonly<{
    authenticatedProjectId: string;
    cursor: string | undefined;
    limit: number;
  }>): Promise<ProjectPage> {
    const selectFields = this.sql`
      SELECT target.id, target.name, target.status,
        project_environments.id AS environment_id, project_environments.name AS environment_name,
        project_environments.issuer, project_environments.audience
      FROM projects AS target
      INNER JOIN projects AS authenticated ON authenticated.id = ${input.authenticatedProjectId}
      INNER JOIN project_environments ON project_environments.project_id = target.id AND project_environments.name = 'development'
      WHERE target.organization_id = authenticated.organization_id
        AND target.status = 'active' AND authenticated.status = 'active'
    `;
    const rows = input.cursor
      ? await this.sql<ProjectListRow[]>`${selectFields} AND target.id > ${input.cursor}::uuid ORDER BY target.id ASC LIMIT ${input.limit + 1}`
      : await this.sql<ProjectListRow[]>`${selectFields} ORDER BY target.id ASC LIMIT ${input.limit + 1}`;
    const hasNextPage = rows.length > input.limit;
    const data = rows.slice(0, input.limit).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      defaultEnvironment: {
        id: row.environment_id,
        name: row.environment_name,
        issuer: row.issuer,
        audience: row.audience
      }
    }));
    return { data, nextCursor: hasNextPage ? data.at(-1)?.id : undefined };
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
