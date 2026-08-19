import type { DurableQueuePublisher, OutboxPublisherRepository } from "../modules/notifications/application/publish-outbox.js";
import { publishPendingOutbox } from "../modules/notifications/application/publish-outbox.js";

type WorkerLogger = Readonly<{
  info(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}>;

export const publishOutbox = async (
  repository: OutboxPublisherRepository,
  queue: DurableQueuePublisher,
  logger: WorkerLogger,
  input: Readonly<{ owner: string; now: Date }>
): Promise<void> => {
  try {
    const published = await publishPendingOutbox(repository, queue, {
      ...input,
      leaseDurationMs: 30_000,
      limit: 25
    });
    if (published > 0) logger.info("Outbox events published", { count: published });
  } catch (error) {
    logger.error("Outbox publishing failed", {
      error_name: error instanceof Error ? error.name : "UnknownError"
    });
  }
};
