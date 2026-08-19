import { randomUUID } from "node:crypto";

import postgres from "postgres";

import { PostgresOutboxPublisherRepository } from "../modules/notifications/infrastructure/postgres-outbox-publisher-repository.js";
import { createSqsQueuePublisher } from "../modules/notifications/infrastructure/sqs-queue-publisher.js";
import { loadConfig, loadLocalEnvironmentFile } from "../platform/config.js";
import { Logger } from "../platform/logger.js";
import { publishOutbox } from "./publish-outbox.js";

loadLocalEnvironmentFile();
const config = loadConfig();
const logger = new Logger(config.logLevel, config.environment);
const database = postgres(config.databaseUrl, { max: 5 });
const repository = new PostgresOutboxPublisherRepository(database);
const queue = createSqsQueuePublisher(config);
const workerId = `outbox-publisher:${randomUUID()}`;

logger.info("Worker started", { module: "worker" });

let inFlight: Promise<void> | undefined;
const publish = (): void => {
  if (inFlight) return;
  inFlight = publishOutbox(repository, queue, logger, { owner: workerId, now: new Date() })
    .finally(() => { inFlight = undefined; });
};
publish();
const interval = setInterval(publish, 1_000);

const stop = async (signal: string): Promise<void> => {
  logger.info("Stopping worker", { signal, module: "worker" });
  clearInterval(interval);
  await inFlight;
  await database.end({ timeout: 5 });
  process.exit(0);
};

process.once("SIGTERM", () => void stop("SIGTERM"));
process.once("SIGINT", () => void stop("SIGINT"));
