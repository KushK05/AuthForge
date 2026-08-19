import type postgres from "postgres";

import type { IdentityCredentialsReader, IdentityUserReader, SignInUser } from "../application/user-reader.js";

export class PostgresIdentityUserReader implements IdentityUserReader, IdentityCredentialsReader {
  public constructor(private readonly sql: postgres.Sql) {}

  public async findUserInProject(input: Readonly<{ projectId: string; userId: string }>): Promise<boolean> {
    const [user] = await this.sql<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${input.userId} AND project_id = ${input.projectId}
      LIMIT 1
    `;
    return user !== undefined;
  }

  public async findUserForSignIn(input: Readonly<{
    projectId: string;
    normalizedEmail: string;
  }>): Promise<SignInUser | undefined> {
    const [user] = await this.sql<SignInUser[]>`
      SELECT id, primary_email_normalized AS email, password_hash AS "passwordHash", status, token_version AS "tokenVersion"
      FROM users
      WHERE project_id = ${input.projectId} AND primary_email_normalized = ${input.normalizedEmail}
      LIMIT 1
    `;
    return user;
  }
}
