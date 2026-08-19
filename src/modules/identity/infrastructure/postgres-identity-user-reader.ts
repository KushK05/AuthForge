import type postgres from "postgres";

import type { IdentityUserReader } from "../application/user-reader.js";

export class PostgresIdentityUserReader implements IdentityUserReader {
  public constructor(private readonly sql: postgres.Sql) {}

  public async findUserInProject(input: Readonly<{ projectId: string; userId: string }>): Promise<boolean> {
    const [user] = await this.sql<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${input.userId} AND project_id = ${input.projectId}
      LIMIT 1
    `;
    return user !== undefined;
  }
}
