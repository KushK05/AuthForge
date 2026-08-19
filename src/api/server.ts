import postgres from "postgres";

import { buildApi } from "./app.js";
import { PostgresApiKeyCreationRepository } from "../modules/developer-platform/infrastructure/postgres-api-key-creation-repository.js";
import { PostgresApiKeyRevocationRepository } from "../modules/developer-platform/infrastructure/postgres-api-key-revocation-repository.js";
import { PostgresRedirectUrlRepository } from "../modules/developer-platform/infrastructure/postgres-redirect-url-repository.js";
import { PostgresDeveloperPlatformRepository } from "../modules/developer-platform/infrastructure/postgres-developer-platform-repository.js";
import { PostgresSignUpRepository } from "../modules/identity/infrastructure/postgres-sign-up-repository.js";
import { PostgresEmailVerificationRepository } from "../modules/identity/infrastructure/postgres-email-verification-repository.js";
import { PostgresRoleCreationRepository } from "../modules/authorization/infrastructure/postgres-role-creation-repository.js";
import { PostgresUserRoleAssignmentRepository } from "../modules/authorization/infrastructure/postgres-user-role-assignment-repository.js";
import { PostgresIdentityUserReader } from "../modules/identity/infrastructure/postgres-identity-user-reader.js";
import { loadConfig, loadLocalEnvironmentFile } from "../platform/config.js";
import { Logger } from "../platform/logger.js";

loadLocalEnvironmentFile();
const config = loadConfig();
const logger = new Logger(config.logLevel, config.environment);
const database = postgres(config.databaseUrl, { max: 10 });
const developerPlatform = new PostgresDeveloperPlatformRepository(database);
const api = buildApi(config, logger, {
  repository: developerPlatform,
  projectListReader: developerPlatform,
  apiKeyCreationRepository: new PostgresApiKeyCreationRepository(database),
  apiKeyRevocationRepository: new PostgresApiKeyRevocationRepository(database),
  redirectUrlRepository: new PostgresRedirectUrlRepository(database),
  publishableApiKeyReader: developerPlatform,
  redirectUrlReader: developerPlatform
}, {
  signUpRepository: new PostgresSignUpRepository(database),
  emailVerificationRepository: new PostgresEmailVerificationRepository(database),
  userReader: new PostgresIdentityUserReader(database)
}, {
  roleCreationRepository: new PostgresRoleCreationRepository(database),
  userRoleAssignmentRepository: new PostgresUserRoleAssignmentRepository(database)
});

const close = async (signal: string): Promise<void> => {
  logger.info("Stopping API", { signal });
  await api.close();
  await database.end({ timeout: 5 });
  process.exit(0);
};

process.once("SIGTERM", () => void close("SIGTERM"));
process.once("SIGINT", () => void close("SIGINT"));

void api.listen({ host: config.host, port: config.port }).then(() => {
  logger.info("API started", { host: config.host, port: config.port });
});
