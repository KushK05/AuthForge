import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type postgres from "postgres";

import type { ShowcaseConfig } from "./config.js";

export type ShowcaseOutboxEvent = Readonly<{
  id: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, unknown>;
  createdAt: Date;
}>;

type OutboxRow = Readonly<{
  id: string;
  event_type: string;
  event_version: number;
  payload: Record<string, unknown>;
  created_at: Date;
}>;

type WorkerLogger = Readonly<{
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}>;

export class PostgresShowcaseOutbox {
  public constructor(private readonly sql: postgres.Sql) {}

  public async pending(limit: number): Promise<readonly ShowcaseOutboxEvent[]> {
    const rows = await this.sql<OutboxRow[]>`
      SELECT id, event_type, event_version, payload, created_at
      FROM showcase_outbox_events
      WHERE published_at IS NULL
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      eventVersion: row.event_version,
      payload: row.payload,
      createdAt: row.created_at
    }));
  }

  public async markPublished(id: string, publishedAt: Date): Promise<void> {
    await this.sql`
      UPDATE showcase_outbox_events SET published_at = ${publishedAt}
      WHERE id = ${id} AND published_at IS NULL
    `;
  }

  public async wasProcessed(eventId: string, consumerName: string): Promise<boolean> {
    const [row] = await this.sql<{ event_id: string }[]>`
      SELECT event_id FROM showcase_worker_inbox
      WHERE event_id = ${eventId} AND consumer_name = ${consumerName}
      LIMIT 1
    `;
    return row !== undefined;
  }

  public async markProcessed(eventId: string, consumerName: string): Promise<void> {
    await this.sql`
      INSERT INTO showcase_worker_inbox (event_id, consumer_name)
      VALUES (${eventId}, ${consumerName})
      ON CONFLICT (event_id, consumer_name) DO NOTHING
    `;
  }
}

export const toQueueMessage = (event: ShowcaseOutboxEvent): string => JSON.stringify({
  event_id: event.id,
  event_type: event.eventType,
  event_version: event.eventVersion,
  created_at: event.createdAt.toISOString(),
  ...event.payload
});

export class ShowcaseOutboxWorker {
  private readonly consumerName = "showcase-artifact-writer";
  private readonly sqs: SQSClient;
  private readonly s3: S3Client;
  private readonly ses: SESv2Client;

  public constructor(
    private readonly config: ShowcaseConfig,
    private readonly outbox: PostgresShowcaseOutbox,
    private readonly logger: WorkerLogger
  ) {
    const endpoint = process.env.AWS_SQS_ENDPOINT_URL;
    this.sqs = new SQSClient({ region: config.awsRegion, ...(endpoint ? { endpoint } : {}) });
    this.s3 = new S3Client({ region: config.awsRegion });
    this.ses = new SESv2Client({ region: config.awsRegion });
  }

  public async runOnce(): Promise<void> {
    if (!this.config.showcaseQueueUrl) {
      this.logger.warn("Showcase worker is disabled because SHOWCASE_QUEUE_URL is unset");
      return;
    }
    if (!this.config.showcaseS3Bucket) {
      throw new Error("SHOWCASE_S3_BUCKET is required when the showcase worker is enabled");
    }

    for (const event of await this.outbox.pending(25)) {
      await this.sqs.send(new SendMessageCommand({
        QueueUrl: this.config.showcaseQueueUrl,
        MessageBody: toQueueMessage(event)
      }));
      await this.outbox.markPublished(event.id, new Date());
      this.logger.info("Showcase event published", { event_id: event.id, event_type: event.eventType });
    }

    const response = await this.sqs.send(new ReceiveMessageCommand({
      QueueUrl: this.config.showcaseQueueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 1,
      VisibilityTimeout: 30
    }));

    for (const message of response.Messages ?? []) {
      if (!message.Body || !message.ReceiptHandle) continue;
      const event = JSON.parse(message.Body) as Record<string, unknown>;
      const eventId = typeof event.event_id === "string" ? event.event_id : undefined;
      if (!eventId) throw new Error("Showcase event is missing event_id");
      if (await this.outbox.wasProcessed(eventId, this.consumerName)) {
        await this.sqs.send(new DeleteMessageCommand({
          QueueUrl: this.config.showcaseQueueUrl,
          ReceiptHandle: message.ReceiptHandle
        }));
        continue;
      }
      await this.writeArtifact(event);
      await this.sendSimulatorEmail(event);
      await this.outbox.markProcessed(eventId, this.consumerName);
      await this.sqs.send(new DeleteMessageCommand({
        QueueUrl: this.config.showcaseQueueUrl,
        ReceiptHandle: message.ReceiptHandle
      }));
    }
  }

  private async writeArtifact(event: Record<string, unknown>): Promise<void> {
    const bucket = this.config.showcaseS3Bucket;
    if (!bucket) throw new Error("SHOWCASE_S3_BUCKET is required for event artifacts");
    const eventId = typeof event.event_id === "string" ? event.event_id : "unknown";
    const body = JSON.stringify({
      event_id: eventId,
      event_type: event.event_type,
      event_version: event.event_version,
      created_at: event.created_at,
      processed_at: new Date().toISOString(),
      synthetic: true
    });
    await this.s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `showcase-events/${eventId}.json`,
      Body: body,
      ContentType: "application/json",
      ...(this.config.showcaseS3KmsKeyId
        ? { ServerSideEncryption: "aws:kms" as const, SSEKMSKeyId: this.config.showcaseS3KmsKeyId }
        : {})
    }));
  }

  private async sendSimulatorEmail(event: Record<string, unknown>): Promise<void> {
    if (!this.config.showcaseSesFromEmail || !this.config.showcaseSesSimulatorEmail) return;
    await this.ses.send(new SendEmailCommand({
      FromEmailAddress: this.config.showcaseSesFromEmail,
      Destination: { ToAddresses: [this.config.showcaseSesSimulatorEmail] },
      Content: {
        Simple: {
          Subject: { Data: "AuthForge synthetic showcase event" },
          Body: { Text: { Data: `Synthetic event ${String(event.event_id ?? "unknown")} processed.` } }
        }
      }
    }));
  }
}
