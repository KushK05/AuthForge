export type OutboxEvent = Readonly<{
  id: string;
  eventType: string;
  eventVersion: number;
  projectId: string | undefined;
  correlationId: string;
  occurredAt: Date;
  payload: Readonly<Record<string, unknown>>;
}>;

export interface OutboxPublisherRepository {
  claimPending(input: Readonly<{
    owner: string;
    leaseExpiresAt: Date;
    now: Date;
    limit: number;
  }>): Promise<readonly OutboxEvent[]>;
  markPublished(input: Readonly<{ eventId: string; owner: string; publishedAt: Date }>): Promise<void>;
}

export interface DurableQueuePublisher {
  publish(event: OutboxEvent): Promise<void>;
}

export const publishPendingOutbox = async (
  repository: OutboxPublisherRepository,
  queue: DurableQueuePublisher,
  input: Readonly<{ owner: string; now: Date; leaseDurationMs: number; limit: number }>
): Promise<number> => {
  const events = await repository.claimPending({
    owner: input.owner,
    now: input.now,
    leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
    limit: input.limit
  });
  for (const event of events) {
    await queue.publish(event);
    await repository.markPublished({ eventId: event.id, owner: input.owner, publishedAt: input.now });
  }
  return events.length;
};
