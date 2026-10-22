import postgres from "postgres";

import { PostgresShowcaseOutbox, ShowcaseOutboxWorker } from "../modules/showcase-events/outbox-worker.js";
import { loadConfig, loadLocalEnvironmentFile } from "../platform/config.js";
import { Logger } from "../platform/logger.js";

loadLocalEnvironmentFile();
const config = loadConfig();
const logger = new Logger(config.logLevel, config.environment);
const database = postgres(config.databaseUrl, { max: 5 });
const worker = new ShowcaseOutboxWorker(config, new PostgresShowcaseOutbox(database), logger);

let running = true;
const loop = async (): Promise<void> => {
  while (running) {
    try {
      await worker.runOnce();
    } catch (error) {
      logger.error("Worker iteration failed", {
        error_name: error instanceof Error ? error.name : "UnknownError"
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
};

const close = async (signal: string): Promise<void> => {
  running = false;
  logger.info("Stopping worker", { signal, module: "worker" });
  await database.end({ timeout: 5 });
  process.exit(0);
};

process.once("SIGTERM", () => void close("SIGTERM"));
process.once("SIGINT", () => void close("SIGINT"));

void loop();
