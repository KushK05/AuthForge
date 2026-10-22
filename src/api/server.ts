import postgres from "postgres";

import { loadConfig, loadLocalEnvironmentFile } from "../platform/config.js";
import { Logger } from "../platform/logger.js";
import { PostgresShowcaseStore } from "../platform/postgres-store.js";
import { createRedisClient, RedisConsoleRateLimiter } from "../platform/redis.js";
import { buildApi } from "./app.js";

loadLocalEnvironmentFile();
const config = loadConfig();
const logger = new Logger(config.logLevel, config.environment);
const database = postgres(config.databaseUrl, { max: 10 });
const redis = createRedisClient(config.redisUrl);
const rateLimiter = new RedisConsoleRateLimiter(redis);
const api = buildApi(config, new PostgresShowcaseStore(database), rateLimiter, logger);

const close = async (signal: string): Promise<void> => {
  logger.info("Stopping API", { signal });
  await api.close();
  await database.end({ timeout: 5 });
  redis.disconnect();
  process.exit(0);
};

process.once("SIGTERM", () => void close("SIGTERM"));
process.once("SIGINT", () => void close("SIGINT"));

void api.listen({ host: config.host, port: config.port }).then(() => {
  logger.info("API started", { host: config.host, port: config.port });
});
