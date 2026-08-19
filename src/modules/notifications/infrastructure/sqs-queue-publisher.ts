import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

import type { OutboxEvent, DurableQueuePublisher } from "../application/publish-outbox.js";
import type { AppConfig } from "../../../platform/config.js";

export class SqsQueuePublisher implements DurableQueuePublisher {
  public constructor(
    private readonly client: Pick<SQSClient, "send">,
    private readonly queueUrl: string
  ) {}

  public async publish(event: OutboxEvent): Promise<void> {
    await this.client.send(new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify({
        event_id: event.id,
        event_type: event.eventType,
        event_version: event.eventVersion,
        occurred_at: event.occurredAt.toISOString(),
        project_id: event.projectId,
        correlation_id: event.correlationId,
        payload: event.payload
      })
    }));
  }
}

export const createSqsQueuePublisher = (config: AppConfig): SqsQueuePublisher => {
  if (!config.sqsEmailQueueUrl) throw new Error("SQS_EMAIL_QUEUE_URL is required for the worker");
  return new SqsQueuePublisher(
    new SQSClient({
      region: config.awsRegion,
      ...(config.awsSqsEndpointUrl ? { endpoint: config.awsSqsEndpointUrl } : {})
    }),
    config.sqsEmailQueueUrl
  );
};
