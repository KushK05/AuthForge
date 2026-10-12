import { describe, expect, it } from "vitest";

import { toQueueMessage, type ShowcaseOutboxEvent } from "../../src/showcase/outbox-worker.js";

describe("showcase outbox messages", () => {
  it("contains only the redacted event envelope and identifiers", () => {
    const event: ShowcaseOutboxEvent = {
      id: "event-1",
      eventType: "showcase.session.created",
      eventVersion: 1,
      payload: { session_id: "session-1", api_key_id: "key-1" },
      createdAt: new Date("2026-10-05T00:00:00.000Z")
    };

    expect(JSON.parse(toQueueMessage(event))).toEqual({
      event_id: "event-1",
      event_type: "showcase.session.created",
      event_version: 1,
      created_at: "2026-10-05T00:00:00.000Z",
      session_id: "session-1",
      api_key_id: "key-1"
    });
  });
});
