import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type postgres from "postgres";
import { z } from "zod";

import type { WorkerConfig } from "../../platform/config.js";

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
      WHERE published_at IS NULL AND discarded_at IS NULL
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

  public async discard(id: string): Promise<void> {
    await this.sql`
      UPDATE showcase_outbox_events SET discarded_at = now()
      WHERE id = ${id} AND published_at IS NULL AND discarded_at IS NULL
    `;
  }

  public async processOnce(eventId: string, consumerName: string, effect: () => Promise<void>): Promise<boolean> {
    return this.sql.begin(async transaction => {
      const [lock] = await transaction<{locked: boolean}[]>`SELECT pg_try_advisory_xact_lock(hashtext(${consumerName}), hashtext(${eventId})) AS locked`;
      if (!lock?.locked) return false;
      const [completed] = await transaction`SELECT event_id FROM showcase_worker_inbox WHERE event_id = ${eventId} AND consumer_name = ${consumerName}`;
      if (completed) return true;
      await effect();
      await transaction`INSERT INTO showcase_worker_inbox (event_id, consumer_name) VALUES (${eventId}, ${consumerName}) ON CONFLICT DO NOTHING`;
      return true;
    }) as Promise<boolean>;
  }

}

const eventSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.enum(["showcase.api_key.created", "showcase.api_key.revoked", "showcase.session.created", "showcase.session.revoked", "showcase.test.failure"]),
  event_version: z.literal(1),
  created_at: z.string().datetime(),
  api_key_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  correlation_id: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/)
}).strict();
export type QueueEvent = z.infer<typeof eventSchema>;

export const toQueueMessage = (event: ShowcaseOutboxEvent): string => JSON.stringify(eventSchema.parse({
  event_id: event.id, event_type: event.eventType, event_version: event.eventVersion,
  created_at: event.createdAt.toISOString(),
  correlation_id: event.payload.correlation_id ?? event.id,
  ...(event.payload.api_key_id ? { api_key_id: event.payload.api_key_id } : {}),
  ...(event.payload.session_id ? { session_id: event.payload.session_id } : {})
}));

export interface ShowcaseOutbox {
  pending(limit: number): Promise<readonly ShowcaseOutboxEvent[]>;
  markPublished(id: string, at: Date): Promise<void>;
  discard(id: string): Promise<void>;
  processOnce(eventId: string, consumerName: string, effect: () => Promise<void>): Promise<boolean>;
}

type WorkerClients = { sqs: Pick<SQSClient, "send">; s3: Pick<S3Client, "send">; ses: Pick<SESClient, "send"> };

export class ShowcaseOutboxWorker {
  private readonly consumerName = "showcase-artifact-writer";
  private readonly sqs: Pick<SQSClient, "send">;
  private readonly s3: Pick<S3Client, "send">;
  private readonly ses: Pick<SESClient, "send">;

  public constructor(
    private readonly config: WorkerConfig,
    private readonly outbox: ShowcaseOutbox,
    private readonly logger: WorkerLogger,
    clients?: WorkerClients
  ) {
    this.sqs = clients?.sqs ?? new SQSClient({
      region: config.awsRegion,
      ...(config.awsSqsEndpointUrl ? { endpoint: config.awsSqsEndpointUrl } : {})
    });
    this.s3 = clients?.s3 ?? new S3Client({ region: config.awsRegion, ...(config.awsS3EndpointUrl ? { endpoint: config.awsS3EndpointUrl, forcePathStyle: true } : {}) });
    this.ses = clients?.ses ?? new SESClient({ region: config.awsRegion, ...(config.awsSesEndpointUrl ? { endpoint: config.awsSesEndpointUrl } : {}) });
    if (config.showcaseSesSimulatorEmail && !/^(success|bounce|complaint|ooto|suppressionlist)@simulator\.amazonses\.com$/.test(config.showcaseSesSimulatorEmail)) throw new Error("SES mailbox simulator recipient required");
  }

  public async runOnce(): Promise<void> {
    if (this.config.classroomDirectEvents) {
      await this.runDirectOnce();
      return;
    }
    if (!this.config.showcaseQueueUrl) {
      this.logger.warn("Showcase worker is disabled because SHOWCASE_QUEUE_URL is unset");
      return;
    }
    if (!this.config.showcaseS3Bucket) {
      throw new Error("SHOWCASE_S3_BUCKET is required when the showcase worker is enabled");
    }

    try {
      for (const event of await this.outbox.pending(25)) {
        let messageBody: string;
        try { messageBody = toQueueMessage(event); }
        catch {
          await this.outbox.discard(event.id);
          this.logger.warn("Invalid outbox event discarded", { event_id: event.id, metric: "PublishDiscarded", value: 1 });
          continue;
        }
        await this.sqs.send(new SendMessageCommand({
          QueueUrl: this.config.showcaseQueueUrl,
          MessageBody: messageBody
        }));
        await this.outbox.markPublished(event.id, new Date());
        this.logger.info("Showcase event published", { event_id: event.id, event_type: event.eventType });
      }

    } catch { this.logger.warn("Outbox publishing failed", { metric: "PublishFailure", value: 1 }); }

    const response = await this.sqs.send(new ReceiveMessageCommand({
      QueueUrl: this.config.showcaseQueueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 1,
      VisibilityTimeout: this.config.workerVisibilityTimeoutSeconds ?? 60
    }));

    for (const message of response.Messages ?? []) {
      if (!message.Body || !message.ReceiptHandle) continue;
      try {
        const event = eventSchema.parse(JSON.parse(message.Body));
        const processed = await this.outbox.processOnce(event.event_id, this.consumerName, async () => {
          if (event.event_type === "showcase.test.failure") throw new Error("Controlled synthetic failure");
          await this.writeArtifact(event);
          await this.sendSimulatorEmail(event);
        });
        // A concurrent owner leaves the delivery visible for a later retry.
        if (!processed) continue;
        await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.config.showcaseQueueUrl, ReceiptHandle: message.ReceiptHandle }));
        this.logger.info("Showcase event processed", { event_id: event.event_id, metric: "WorkerSuccess", value: 1 });
      } catch {
        this.logger.warn("Showcase event processing failed", { metric: "WorkerFailure", value: 1 });
      }
    }
  }

  private async runDirectOnce(): Promise<void> {
    for (const outboxEvent of await this.outbox.pending(25)) {
      try {
        const event = eventSchema.parse(JSON.parse(toQueueMessage(outboxEvent)));
        if (event.event_type === "showcase.test.failure") throw new Error("Controlled synthetic failure");
        const processed = await this.outbox.processOnce(event.event_id, "classroom-artifact-writer", async () => {
          await this.writeArtifact(event);
          await this.sendSimulatorEmail(event);
        });
        if (!processed) continue;
        await this.outbox.markPublished(outboxEvent.id, new Date());
        this.logger.info("Classroom event processed", {event_id: event.event_id, metric: "WorkerSuccess", value: 1});
      } catch {
        this.logger.warn("Classroom event processing failed", {event_id: outboxEvent.id, metric: "WorkerFailure", value: 1});
      }
    }
  }

  private async writeArtifact(event: QueueEvent): Promise<void> {
    const bucket = this.config.showcaseS3Bucket;
    if (!bucket) throw new Error("SHOWCASE_S3_BUCKET is required for event artifacts");
    const eventId = typeof event.event_id === "string" ? event.event_id : "unknown";
    const body = JSON.stringify({
      ...event,
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
    this.logger.info("Redacted artifact written", {metric: "ArtifactWrite", value: 1});
  }

  private async sendSimulatorEmail(event: QueueEvent): Promise<void> {
    if (!this.config.showcaseSesFromEmail || !this.config.showcaseSesSimulatorEmail) return;
    await this.ses.send(new SendEmailCommand({
      Source: this.config.showcaseSesFromEmail,
      Destination: { ToAddresses: [this.config.showcaseSesSimulatorEmail] },
      Message: {
        Subject: { Data: "AuthForge synthetic showcase event" },
        Body: { Text: { Data: `Synthetic event ${event.event_id} processed.` } }
      }
    }));
    this.logger.info("SES simulator message accepted", {metric: "SimulatorEmailSuccess", value: 1});
  }
}
