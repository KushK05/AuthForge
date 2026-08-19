import { describe, expect, it } from "vitest";

import type { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

import type { OutboxEvent } from "../../src/modules/notifications/application/publish-outbox.js";
import { SqsQueuePublisher } from "../../src/modules/notifications/infrastructure/sqs-queue-publisher.js";

const event: OutboxEvent = {
  id: "event-1", eventType: "identity.email_verification.requested", eventVersion: 1,
  projectId: "project-1", correlationId: "request_12345678", occurredAt: new Date("2026-08-10T00:00:00.000Z"),
  payload: { token_id: "token-1", user_id: "user-1" }
};

describe("SqsQueuePublisher", () => {
  it("serializes the versioned envelope without adding credentials or PII", async () => {
    const sent: unknown[] = [];
    const publisher = new SqsQueuePublisher({
      send: async (command: unknown) => {
        sent.push(command);
        return {};
      }
    } as Pick<SQSClient, "send">, "https://queue.example.test/email");

    await publisher.publish(event);

    const command = sent[0] as SendMessageCommand;
    expect(command.input).toEqual({
      QueueUrl: "https://queue.example.test/email",
      MessageBody: JSON.stringify({
        event_id: "event-1", event_type: "identity.email_verification.requested", event_version: 1,
        occurred_at: "2026-08-10T00:00:00.000Z", project_id: "project-1",
        correlation_id: "request_12345678", payload: { token_id: "token-1", user_id: "user-1" }
      })
    });
  });
});
