import type postgres from "postgres";

import type {
  DevelopmentSeedRepository,
  DevelopmentSeedTransaction
} from "../application/seed-development.js";

export class PostgresDevelopmentSeedRepository implements DevelopmentSeedRepository {
  public constructor(private readonly sql: postgres.Sql) {}

  public transaction<T>(operation: (transaction: DevelopmentSeedTransaction) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => operation(new PostgresDevelopmentSeedTransaction(sql))) as Promise<T>;
  }
}

class PostgresDevelopmentSeedTransaction implements DevelopmentSeedTransaction {
  public constructor(private readonly sql: postgres.TransactionSql) {}

  public async hasExistingDevelopmentSeed(): Promise<boolean> {
    const [existing] = await this.sql<{ id: string }[]>`
      SELECT projects.id
      FROM projects
      INNER JOIN developer_organizations ON developer_organizations.id = projects.organization_id
      WHERE developer_organizations.name = 'AuthForge local development'
        AND projects.name = 'AuthForge bootstrap'
      LIMIT 1
    `;
    return Boolean(existing);
  }

  public async createOrganization(name: string): Promise<string> {
    const [organization] = await this.sql<{ id: string }[]>`
      INSERT INTO developer_organizations (name) VALUES (${name}) RETURNING id
    `;
    if (!organization) throw new Error("Organization insertion did not return an identifier");
    return organization.id;
  }

  public async createProject(input: Readonly<{ organizationId: string; name: string }>): Promise<string> {
    const [project] = await this.sql<{ id: string }[]>`
      INSERT INTO projects (organization_id, name) VALUES (${input.organizationId}, ${input.name}) RETURNING id
    `;
    if (!project) throw new Error("Project insertion did not return an identifier");
    return project.id;
  }

  public async createEnvironment(input: Readonly<{
    projectId: string;
    issuer: string;
    audience: string;
  }>): Promise<string> {
    const [environment] = await this.sql<{ id: string }[]>`
      INSERT INTO project_environments (project_id, name, issuer, audience)
      VALUES (${input.projectId}, 'development', ${input.issuer}, ${input.audience})
      RETURNING id
    `;
    if (!environment) throw new Error("Environment insertion did not return an identifier");
    return environment.id;
  }

  public async createSecretKey(input: Readonly<{
    projectId: string;
    environmentId: string;
    secretHash: Buffer;
    prefix: string;
    scopes: readonly string[];
  }>): Promise<void> {
    await this.sql`
      INSERT INTO api_keys (project_id, environment_id, kind, secret_hash, prefix, scopes)
      VALUES (
        ${input.projectId}, ${input.environmentId}, 'secret', ${input.secretHash},
        ${input.prefix}, ${this.sql.array([...input.scopes])}
      )
    `;
  }

  public async appendSeedAuditEvent(projectId: string): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (project_id, actor_type, action, target_type, target_id, correlation_id)
      VALUES (${projectId}, 'system', 'developer.project.seeded', 'project', ${projectId}, 'seed_00000001')
    `;
  }
}
