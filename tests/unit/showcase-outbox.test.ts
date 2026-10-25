import { loadWorkerConfig } from "../../src/platform/config.js";

import { describe, expect, it } from "vitest";

import { ShowcaseOutboxWorker, toQueueMessage, type ShowcaseOutboxEvent } from "../../src/modules/showcase-events/outbox-worker.js";

describe("showcase outbox messages", () => {
  it("contains only the redacted event envelope and identifiers", () => {
    const event: ShowcaseOutboxEvent = {
      id: "00000000-0000-4000-8000-000000000001",
      eventType: "showcase.session.created",
      eventVersion: 1,
      payload: { subject: "must-never-leak", password: "must-never-leak", session_id: "00000000-0000-4000-8000-000000000002", api_key_id: "00000000-0000-4000-8000-000000000003" },
      createdAt: new Date("2026-10-05T00:00:00.000Z")
    };

    expect(JSON.parse(toQueueMessage(event))).toEqual({
      correlation_id: "00000000-0000-4000-8000-000000000001",
      event_id: "00000000-0000-4000-8000-000000000001",
      event_type: "showcase.session.created",
      event_version: 1,
      created_at: "2026-10-05T00:00:00.000Z",
      session_id: "00000000-0000-4000-8000-000000000002",
      api_key_id: "00000000-0000-4000-8000-000000000003"
    });
  });
  it("rejects unknown event types before publication", () => {
    expect(() => toQueueMessage({id: "00000000-0000-4000-8000-000000000001", eventType: "unapproved", eventVersion: 1, payload: {}, createdAt: new Date()})).toThrow();
  });
});


describe("outbox publication failures", () => {
  it("discards invalid and legacy events, publishes subsequent valid events, and retries transport failures", async () => {
    const events = ["showcase.session.refreshed", "showcase.session.replay_detected", "invalid", "showcase.api_key.created"]
      .map((eventType, i) => ({id: `00000000-0000-4000-8000-00000000000${i + 1}`, eventType, eventVersion: 1, payload: {}, createdAt: new Date()}));
    const terminal = new Set<string>(); const discarded: string[] = []; const published: string[] = []; const logs: string[] = [];
    let failTransport = true;
    const config = loadWorkerConfig({NODE_ENV: "test", DATABASE_URL: "postgres://test:test@localhost/test", SHOWCASE_QUEUE_URL: "http://localhost/queue", SHOWCASE_S3_BUCKET: "synthetic"});
    const worker = new ShowcaseOutboxWorker(config, {
      pending: async () => events.filter(event => !terminal.has(event.id)),
      discard: async id => {discarded.push(id); terminal.add(id);},
      markPublished: async id => {published.push(id); terminal.add(id);},
      processOnce: async () => true
    }, {info: () => {}, error: () => {}, warn: (message, fields) => {logs.push(JSON.stringify({message, ...fields}));}}, {
      sqs: {send: async command => {
        if (command.constructor.name === "SendMessageCommand" && failTransport) throw new Error("transport");
        return {Messages: []};
      }}, s3: {send: async () => ({})}, ses: {send: async () => ({})}
    });
    await worker.runOnce();
    expect(discarded).toEqual(events.slice(0, 3).map(event => event.id));
    expect(published).toEqual([]);
    failTransport = false;
    await worker.runOnce(); await worker.runOnce();
    expect(published).toEqual([events[3]!.id]);
    expect(discarded).toHaveLength(3);
    expect(logs.join("")).toContain("PublishFailure");
    expect(logs.join("")).toContain("PublishDiscarded");
    expect(logs.join("")).not.toContain("showcase.session.refreshed");
  });
});
