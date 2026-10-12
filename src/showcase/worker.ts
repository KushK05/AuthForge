import postgres from "postgres";

import { loadLocalEnvironmentFile } from "../platform/config.js";
import { Logger } from "../platform/logger.js";
import { loadShowcaseConfig } from "./config.js";
import { PostgresShowcaseOutbox, ShowcaseOutboxWorker } from "./outbox-worker.js";

loadLocalEnvironmentFile();
const config = loadShowcaseConfig();
const logger = new Logger(config.logLevel, config.environment);
const database = postgres(config.databaseUrl, { max: 5 });
const worker = new ShowcaseOutboxWorker(config, new PostgresShowcaseOutbox(database), logger);

let running = true;
const loop = async (): Promise<void> => {
  while (running) {
    try {
      await worker.runOnce();
    } catch (error) {
      logger.error("Showcase worker iteration failed", {
        error_name: error instanceof Error ? error.name : "UnknownError"
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
};

const close = async (signal: string): Promise<void> => {
  running = false;
  logger.info("Stopping showcase worker", { signal });
  await database.end({ timeout: 5 });
  process.exit(0);
};

process.once("SIGTERM", () => void close("SIGTERM"));
process.once("SIGINT", () => void close("SIGINT"));

void loop();
