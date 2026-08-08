import postgres from "postgres";

import { seedDevelopment } from "../modules/developer-platform/application/seed-development.js";
import { PostgresDevelopmentSeedRepository } from "../modules/developer-platform/infrastructure/postgres-development-seed-repository.js";
import { loadConfig, loadLocalEnvironmentFile } from "./config.js";

loadLocalEnvironmentFile();
const config = loadConfig();
const database = postgres(config.databaseUrl, { max: 1 });

try {
  const result = await seedDevelopment(new PostgresDevelopmentSeedRepository(database), {
    environment: config.environment,
    issuerBaseUrl: config.publicIssuerBaseUrl,
    hashKey: config.apiKeyHashKey
  });
  process.stdout.write(
    `Development seed complete. Save this bootstrap secret key now; it cannot be displayed again:\n${result.secretApiKey}\n`
  );
} finally {
  await database.end({ timeout: 5 });
}
