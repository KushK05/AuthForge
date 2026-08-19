import type postgres from "postgres";

import type { RoleCreationRepository, RoleCreationTransaction, RoleSummary } from "../application/create-role.js";

type IdempotencyRow = Readonly<{ request_hash: Buffer; response_body: RoleSummary }>;
type RoleRow = Readonly<{ id: string; name: string; description: string | null; permissions: string[] }>;

export class PostgresRoleCreationRepository implements RoleCreationRepository {
  public constructor(private readonly sql: postgres.Sql) {}

  public transaction<T>(operation: (transaction: RoleCreationTransaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => operation(new PostgresRoleCreationTransaction(sql))) as Promise<T>;
  }
}

class PostgresRoleCreationTransaction implements RoleCreationTransaction {
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
  }>): Promise<Readonly<{ requestHash: Buffer; role: RoleSummary }> | undefined> {
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
    return record ? { requestHash: record.request_hash, role: record.response_body } : undefined;
  }

  public async findKnownPermissions(codes: readonly string[]): Promise<readonly string[]> {
    const rows = await this.sql<{ code: string }[]>`
      SELECT code FROM permissions WHERE code = ANY(${this.sql.array([...codes])})
    `;
    return rows.map((row) => row.code);
  }

  public async createRole(input: Readonly<{
    id: string;
    projectId: string;
    name: string;
    description: string | undefined;
    permissions: readonly string[];
  }>): Promise<RoleSummary> {
    await this.sql`
      INSERT INTO roles (id, project_id, name, description)
      VALUES (${input.id}, ${input.projectId}, ${input.name}, ${input.description ?? null})
    `;
    await this.sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT ${input.id}, id FROM permissions WHERE code = ANY(${this.sql.array([...input.permissions])})
    `;
    const [role] = await this.sql<RoleRow[]>`
      SELECT roles.id, roles.name, roles.description, array_agg(permissions.code ORDER BY permissions.code) AS permissions
      FROM roles
      INNER JOIN role_permissions ON role_permissions.role_id = roles.id
      INNER JOIN permissions ON permissions.id = role_permissions.permission_id
      WHERE roles.id = ${input.id} AND roles.project_id = ${input.projectId}
      GROUP BY roles.id, roles.name, roles.description
    `;
    if (!role) throw new Error("Role insertion did not return a role");
    return { id: role.id, name: role.name, description: role.description ?? undefined, permissions: role.permissions };
  }

  public async appendAuditEvent(input: Readonly<{
    projectId: string;
    actorKeyId: string;
    action: "authorization.role.created";
    roleId: string;
    correlationId: string;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (project_id, actor_type, actor_id, action, target_type, target_id, correlation_id)
      VALUES (
        ${input.projectId}, 'api_key', ${input.actorKeyId}, ${input.action},
        'role', ${input.roleId}, ${input.correlationId}
      )
    `;
  }

  public async appendOutboxEvent(input: Readonly<{
    id: string;
    projectId: string;
    correlationId: string;
    payload: Readonly<{ role_id: string }>;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO outbox_events (id, event_type, event_version, project_id, correlation_id, payload)
      VALUES (
        ${input.id}, 'authorization.role.created', 1, ${input.projectId}, ${input.correlationId},
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
    role: RoleSummary;
    expiresAt: Date;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO idempotency_records (
        principal_id, project_id, route, idempotency_key, request_hash,
        response_status, response_body, expires_at
      ) VALUES (
        ${input.principalId}, ${input.projectId}, ${input.route}, ${input.key}, ${input.requestHash},
        201, ${this.sql.json(input.role)}, ${input.expiresAt}
      )
    `;
  }
}
