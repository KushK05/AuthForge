import { randomUUID } from "node:crypto";

import type postgres from "postgres";

import type {
  UserRoleAssignmentRepository,
  UserRoleAssignmentTransaction
} from "../application/replace-user-roles.js";

type IdempotencyRow = Readonly<{ request_hash: Buffer; response_body: { role_ids: string[] } }>;

export class PostgresUserRoleAssignmentRepository implements UserRoleAssignmentRepository {
  public constructor(private readonly sql: postgres.Sql) {}

  public transaction<T>(operation: (transaction: UserRoleAssignmentTransaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => operation(new PostgresUserRoleAssignmentTransaction(sql))) as Promise<T>;
  }
}

class PostgresUserRoleAssignmentTransaction implements UserRoleAssignmentTransaction {
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
  }>): Promise<Readonly<{ requestHash: Buffer; roleIds: readonly string[] }> | undefined> {
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
    return record ? { requestHash: record.request_hash, roleIds: record.response_body.role_ids } : undefined;
  }

  public async findRoleIds(input: Readonly<{
    projectId: string;
    roleIds: readonly string[];
  }>): Promise<readonly string[]> {
    if (input.roleIds.length === 0) return [];
    const rows = await this.sql<{ id: string }[]>`
      SELECT id FROM roles
      WHERE project_id = ${input.projectId} AND id = ANY(${this.sql.array([...input.roleIds])}::uuid[])
    `;
    return rows.map((row) => row.id);
  }

  public async replaceUserRoles(input: Readonly<{
    projectId: string;
    userId: string;
    roleIds: readonly string[];
  }>): Promise<void> {
    await this.sql`DELETE FROM user_roles WHERE project_id = ${input.projectId} AND user_id = ${input.userId}`;
    if (input.roleIds.length === 0) return;
    await this.sql`
      INSERT INTO user_roles (project_id, user_id, role_id)
      SELECT ${input.projectId}, ${input.userId}, role_id
      FROM unnest(${this.sql.array([...input.roleIds])}::uuid[]) AS role_id
    `;
  }

  public async appendAuditEvent(input: Readonly<{
    projectId: string;
    actorKeyId: string;
    action: "authorization.user_roles.replaced";
    userId: string;
    correlationId: string;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (project_id, actor_type, actor_id, action, target_type, target_id, correlation_id)
      VALUES (
        ${input.projectId}, 'api_key', ${input.actorKeyId}, ${input.action},
        'user', ${input.userId}, ${input.correlationId}
      )
    `;
  }

  public async appendOutboxEvent(input: Readonly<{
    projectId: string;
    correlationId: string;
    payload: Readonly<{ user_id: string; role_ids: readonly string[] }>;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO outbox_events (id, event_type, event_version, project_id, correlation_id, payload)
      VALUES (
        ${randomUUID()}, 'authorization.user_roles.replaced', 1, ${input.projectId}, ${input.correlationId},
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
    roleIds: readonly string[];
    expiresAt: Date;
  }>): Promise<void> {
    await this.sql`
      INSERT INTO idempotency_records (
        principal_id, project_id, route, idempotency_key, request_hash,
        response_status, response_body, expires_at
      ) VALUES (
        ${input.principalId}, ${input.projectId}, ${input.route}, ${input.key}, ${input.requestHash},
        200, ${this.sql.json({ role_ids: input.roleIds })}, ${input.expiresAt}
      )
    `;
  }
}
