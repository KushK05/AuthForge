import type postgres from "postgres";

import type { UserAuthorizationClaims, UserRoleReader } from "../application/user-role-reader.js";

type RolePermissionRow = Readonly<{ role_name: string; permission_code: string | null }>;

export class PostgresUserRoleReader implements UserRoleReader {
  public constructor(private readonly sql: postgres.Sql) {}

  public async findUserAuthorizationClaims(input: Readonly<{
    projectId: string;
    userId: string;
  }>): Promise<UserAuthorizationClaims> {
    const rows = await this.sql<RolePermissionRow[]>`
      SELECT roles.name AS role_name, permissions.code AS permission_code
      FROM user_roles
      INNER JOIN roles ON roles.id = user_roles.role_id AND roles.project_id = user_roles.project_id
      LEFT JOIN role_permissions ON role_permissions.role_id = roles.id
      LEFT JOIN permissions ON permissions.id = role_permissions.permission_id
      WHERE user_roles.project_id = ${input.projectId} AND user_roles.user_id = ${input.userId}
      ORDER BY roles.name ASC, permissions.code ASC
    `;
    return {
      roles: [...new Set(rows.map((row) => row.role_name))],
      scope: [...new Set(rows.flatMap((row) => row.permission_code ? [row.permission_code] : []))]
    };
  }
}
