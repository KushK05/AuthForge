import { loadConfig } from "../platform/config.js";
import { Logger } from "../platform/logger.js";

const config = loadConfig();
const logger = new Logger(config.logLevel, config.environment);

logger.info("Worker started", { module: "worker" });

const keepAlive = setInterval(() => undefined, 60_000);

const stop = (signal: string): void => {
  logger.info("Stopping worker", { signal, module: "worker" });
  clearInterval(keepAlive);
  process.exit(0);
};

process.once("SIGTERM", () => stop("SIGTERM"));
process.once("SIGINT", () => stop("SIGINT"));
