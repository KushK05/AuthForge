import { generateApiKey, hashOpaqueSecret } from "../../../shared/crypto/opaque-secret.js";

const developmentOrganizationName = "AuthForge local development";
const developmentProjectName = "AuthForge bootstrap";

export type DevelopmentSeedResult = Readonly<{
  organizationId: string;
  projectId: string;
  secretApiKey: string;
}>;

export interface DevelopmentSeedTransaction {
  hasExistingDevelopmentSeed(): Promise<boolean>;
  createOrganization(name: string): Promise<string>;
  createProject(input: Readonly<{ organizationId: string; name: string }>): Promise<string>;
  createEnvironment(input: Readonly<{
    projectId: string;
    issuer: string;
    audience: string;
  }>): Promise<string>;
  createSecretKey(input: Readonly<{
    projectId: string;
    environmentId: string;
    secretHash: Buffer;
    prefix: string;
    scopes: readonly string[];
  }>): Promise<void>;
  appendSeedAuditEvent(projectId: string): Promise<void>;
}

export interface DevelopmentSeedRepository {
  transaction<T>(operation: (transaction: DevelopmentSeedTransaction) => Promise<T>): Promise<T>;
}

export const seedDevelopment = async (
  repository: DevelopmentSeedRepository,
  input: Readonly<{ environment: string; issuerBaseUrl: string; hashKey: string }>
): Promise<DevelopmentSeedResult> => {
  if (input.environment !== "development") {
    throw new Error("Development seed may only run with NODE_ENV=development");
  }

  return repository.transaction(async (transaction) => {
    if (await transaction.hasExistingDevelopmentSeed()) {
      throw new Error("Development seed already exists; bootstrap keys are never revealed again");
    }

    const organizationId = await transaction.createOrganization(developmentOrganizationName);
    const projectId = await transaction.createProject({
      organizationId,
      name: developmentProjectName
    });
    const environmentId = await transaction.createEnvironment({
      projectId,
      issuer: `${input.issuerBaseUrl.replace(/\/$/, "")}/v1/projects/${projectId}`,
      audience: projectId
    });
    const key = generateApiKey("secret");
    await transaction.createSecretKey({
      projectId,
      environmentId,
      secretHash: hashOpaqueSecret(key.value, input.hashKey),
      prefix: key.prefix,
      scopes: ["projects:read", "projects:write", "keys:write", "roles:write", "audit:read"]
    });
    await transaction.appendSeedAuditEvent(projectId);

    return { organizationId, projectId, secretApiKey: key.value };
  });
};
