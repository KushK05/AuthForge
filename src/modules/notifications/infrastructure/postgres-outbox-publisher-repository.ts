import type postgres from "postgres";

import type { OutboxEvent, OutboxPublisherRepository } from "../application/publish-outbox.js";

type OutboxRow = Readonly<{
  id: string;
  event_type: string;
  event_version: number;
  project_id: string | null;
  correlation_id: string;
  occurred_at: Date;
  payload: Record<string, unknown>;
}>;

export class PostgresOutboxPublisherRepository implements OutboxPublisherRepository {
  public constructor(private readonly sql: postgres.Sql) {}

  public async claimPending(input: Readonly<{
    owner: string;
    leaseExpiresAt: Date;
    now: Date;
    limit: number;
  }>): Promise<readonly OutboxEvent[]> {
    const rows = await this.sql<OutboxRow[]>`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE published_at IS NULL
          AND (lease_expires_at IS NULL OR lease_expires_at <= ${input.now})
        ORDER BY occurred_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      )
      UPDATE outbox_events AS event
      SET lease_owner = ${input.owner}, lease_expires_at = ${input.leaseExpiresAt}, attempts = event.attempts + 1
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.id, event.event_type, event.event_version, event.project_id,
        event.correlation_id, event.occurred_at, event.payload
    `;
    return rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      eventVersion: row.event_version,
      projectId: row.project_id ?? undefined,
      correlationId: row.correlation_id,
      occurredAt: row.occurred_at,
      payload: row.payload
    }));
  }

  public async markPublished(input: Readonly<{
    eventId: string;
    owner: string;
    publishedAt: Date;
  }>): Promise<void> {
    await this.sql`
      UPDATE outbox_events
      SET published_at = ${input.publishedAt}, lease_owner = NULL, lease_expires_at = NULL
      WHERE id = ${input.eventId} AND published_at IS NULL AND lease_owner = ${input.owner}
    `;
  }
}
