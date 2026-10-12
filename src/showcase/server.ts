import postgres from "postgres";

import { loadLocalEnvironmentFile } from "../platform/config.js";
import { Logger } from "../platform/logger.js";
import { buildShowcaseApi } from "./app.js";
import { loadShowcaseConfig } from "./config.js";
import { PostgresShowcaseStore } from "./postgres-store.js";

loadLocalEnvironmentFile();
const config = loadShowcaseConfig();
const logger = new Logger(config.logLevel, config.environment);
const database = postgres(config.databaseUrl, { max: 10 });
const api = buildShowcaseApi(config, new PostgresShowcaseStore(database), logger);

const close = async (signal: string): Promise<void> => {
  logger.info("Stopping showcase API", { signal });
  await api.close();
  await database.end({ timeout: 5 });
  process.exit(0);
};

process.once("SIGTERM", () => void close("SIGTERM"));
process.once("SIGINT", () => void close("SIGINT"));

void api.listen({ host: config.host, port: config.port }).then(() => {
  logger.info("Showcase API started", { host: config.host, port: config.port });
});
