import { buildApi } from "./app.js";
import { loadConfig } from "../platform/config.js";
import { Logger } from "../platform/logger.js";

const config = loadConfig();
const logger = new Logger(config.logLevel, config.environment);
const api = buildApi(config, logger);

const close = async (signal: string): Promise<void> => {
  logger.info("Stopping API", { signal });
  await api.close();
  process.exit(0);
};

process.once("SIGTERM", () => void close("SIGTERM"));
process.once("SIGINT", () => void close("SIGINT"));

void api.listen({ host: config.host, port: config.port }).then(() => {
  logger.info("API started", { host: config.host, port: config.port });
});
