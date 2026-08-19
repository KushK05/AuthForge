import { describe, expect, it, vi } from "vitest";

import type { DurableQueuePublisher, OutboxPublisherRepository } from "../../src/modules/notifications/application/publish-outbox.js";
import { publishOutbox } from "../../src/worker/publish-outbox.js";

describe("publishOutbox", () => {
  it("records publish failures without exposing event payloads", async () => {
    const repository: OutboxPublisherRepository = {
      claimPending: async () => { throw new Error("queue claim failed"); },
      markPublished: async () => undefined
    };
    const queue: DurableQueuePublisher = { publish: async () => undefined };
    const logger = { info: vi.fn(), error: vi.fn() };

    await expect(publishOutbox(repository, queue, logger, {
      owner: "worker-1", now: new Date("2026-08-10T00:00:00.000Z")
    })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith("Outbox publishing failed", { error_name: "Error" });
  });
});
