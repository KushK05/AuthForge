import { describe, expect, it, vi } from "vitest";

import {
  publishPendingOutbox,
  type DurableQueuePublisher,
  type OutboxEvent,
  type OutboxPublisherRepository
} from "../../src/modules/notifications/application/publish-outbox.js";

const event: OutboxEvent = {
  id: "event-1",
  eventType: "identity.email_verification.requested",
  eventVersion: 1,
  projectId: "project-1",
  correlationId: "request_12345678",
  occurredAt: new Date("2026-08-10T00:00:00.000Z"),
  payload: { token_id: "token-1", user_id: "user-1", redirect_url: undefined }
};

describe("publishPendingOutbox", () => {
  it("leases events, publishes their minimal payload, then records delivery", async () => {
    const repository: OutboxPublisherRepository = {
      claimPending: vi.fn(async () => [event]),
      markPublished: vi.fn(async () => undefined)
    };
    const queue: DurableQueuePublisher = { publish: vi.fn(async () => undefined) };
    const now = new Date("2026-08-10T01:00:00.000Z");

    await expect(publishPendingOutbox(repository, queue, {
      owner: "worker-1", now, leaseDurationMs: 30_000, limit: 10
    })).resolves.toBe(1);

    expect(repository.claimPending).toHaveBeenCalledWith({
      owner: "worker-1", now, leaseExpiresAt: new Date("2026-08-10T01:00:30.000Z"), limit: 10
    });
    expect(queue.publish).toHaveBeenCalledWith(event);
    expect(repository.markPublished).toHaveBeenCalledWith({ eventId: "event-1", owner: "worker-1", publishedAt: now });
  });

  it("does not mark delivery when the queue publish fails", async () => {
    const repository: OutboxPublisherRepository = {
      claimPending: async () => [event],
      markPublished: vi.fn(async () => undefined)
    };
    const queue: DurableQueuePublisher = { publish: async () => { throw new Error("SQS unavailable"); } };

    await expect(publishPendingOutbox(repository, queue, {
      owner: "worker-1", now: new Date(), leaseDurationMs: 30_000, limit: 10
    })).rejects.toThrow("SQS unavailable");
    expect(repository.markPublished).not.toHaveBeenCalled();
  });
});
