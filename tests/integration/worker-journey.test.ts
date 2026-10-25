import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SQSClient, GetQueueUrlCommand, ReceiveMessageCommand, SendMessageCommand, PurgeQueueCommand } from "@aws-sdk/client-sqs";
import { SESClient } from "@aws-sdk/client-ses";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { loadWorkerConfig } from "../../src/platform/config.js";
import { applyMigrations } from "../../src/platform/database/migrate.js";
import { PostgresShowcaseOutbox, ShowcaseOutboxWorker } from "../../src/modules/showcase-events/outbox-worker.js";

const enabled = process.env.AUTHFORGE_LOCAL_INTEGRATION === "true";
describe.skipIf(!enabled)("local SQS, S3, SES and DLQ journey", () => {
  const endpoint = "http://127.0.0.1:54566";
  const credentials = {accessKeyId: "test", secretAccessKey: "test"};
  const sqs = new SQSClient({region: "us-east-1", endpoint, credentials});
  const s3 = new S3Client({region: "us-east-1", endpoint, credentials, forcePathStyle: true});
  const sql = postgres("postgres://authforge:authforge@127.0.0.1:55432/authforge", {max: 1, onnotice: () => {}});
  const config = loadWorkerConfig({NODE_ENV: "test", DATABASE_URL: "postgres://authforge:authforge@127.0.0.1:55432/authforge", AWS_SQS_ENDPOINT_URL: endpoint, AWS_S3_ENDPOINT_URL: endpoint, AWS_SES_ENDPOINT_URL: endpoint, SHOWCASE_S3_BUCKET: "authforge-events", SHOWCASE_SES_FROM_EMAIL: "sender@authforge.demo", SHOWCASE_SES_SIMULATOR_EMAIL: "success@simulator.amazonses.com"});
  let queueUrl: string, dlqUrl: string;
  const logs: string[] = [];
  const logger = {info: (message: string, fields?: Record<string, unknown>) => {logs.push(JSON.stringify({message, ...fields}));}, warn: (message: string, fields?: Record<string, unknown>) => {logs.push(JSON.stringify({message, ...fields}));}, error: () => {}};
  let worker: ShowcaseOutboxWorker;
  const event = (id: string, type = "showcase.session.created") => ({event_id: id, event_type: type, event_version: 1, created_at: new Date().toISOString(), correlation_id: id});
  beforeAll(async () => {
    await applyMigrations(sql);
    const localUrl = (value: string) => {const url = new URL(value); return endpoint + url.pathname;};
    queueUrl = localUrl((await sqs.send(new GetQueueUrlCommand({QueueName: "authforge-events"}))).QueueUrl!);
    dlqUrl = localUrl((await sqs.send(new GetQueueUrlCommand({QueueName: "authforge-events-dlq"}))).QueueUrl!);
    await sqs.send(new PurgeQueueCommand({QueueUrl: queueUrl}));
    await sqs.send(new PurgeQueueCommand({QueueUrl: dlqUrl}));
    worker = new ShowcaseOutboxWorker({...config, showcaseQueueUrl: queueUrl, workerVisibilityTimeoutSeconds: 0}, new PostgresShowcaseOutbox(sql), logger, {sqs, s3, ses: new SESClient({region: "us-east-1", endpoint, credentials})});
  });
  afterAll(async () => {await sql.end(); sqs.destroy(); s3.destroy();});

  it("publishes an outbox event, writes a redacted artifact, calls simulator SES, and deduplicates delivery", async () => {
    const id = randomUUID();
    await sql`INSERT INTO showcase_outbox_events (id, event_type, event_version, payload, created_at) VALUES (${id}, 'showcase.session.created', 1, ${sql.json({session_id: randomUUID()})}, now())`;
    await worker.runOnce();
    let completed = false;
    for (let i = 0; i < 10; i++) {
      const [row] = await sql`SELECT event_id FROM showcase_worker_inbox WHERE event_id = ${id}`;
      if (row) {completed = true; break;}
      await worker.runOnce();
    }
    expect(completed).toBe(true);
    const artifact = await s3.send(new GetObjectCommand({Bucket: config.showcaseS3Bucket!, Key: `showcase-events/${id}.json`}));
    const body = JSON.parse(await artifact.Body!.transformToString());
    expect(body).toMatchObject({event_id: id, synthetic: true});
    expect(body).not.toHaveProperty("subject");
    expect(body).not.toHaveProperty("password");
    const sent = await fetch(`${endpoint}/_aws/ses`);
    expect(sent.ok).toBe(true);
    const messages = JSON.stringify(await sent.json());
    expect(messages).toContain("success@simulator.amazonses.com");
    expect(messages).not.toContain("demo-user-1");
    await sqs.send(new SendMessageCommand({QueueUrl: queueUrl, MessageBody: JSON.stringify(event(id))}));
    await worker.runOnce();
    const rows = await sql`SELECT event_id FROM showcase_worker_inbox WHERE event_id = ${id}`;
    expect(rows).toHaveLength(1);
    expect(logs.join("")).toContain("WorkerSuccess");
  });

  it("upgrades legacy pending rows and skips new invalid rows without blocking valid events", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    // Recreate the pre-0014 state inside a rolled-back transaction.
    const rollback = new Error("rollback migration fixture");
    await expect(sql.begin(async transaction => {
      await transaction`ALTER TABLE showcase_outbox_events DROP COLUMN discarded_at`;
      await transaction`CREATE INDEX showcase_outbox_pending_idx ON showcase_outbox_events (created_at) WHERE published_at IS NULL`;
      await transaction`INSERT INTO showcase_outbox_events (id, event_type, event_version, payload, created_at)
        VALUES (${ids[0]!}, 'showcase.session.refreshed', 1, '{}', now()),
               (${ids[1]!}, 'showcase.session.replay_detected', 1, '{}', now())`;
      await transaction.unsafe(await readFile(new URL("../../src/platform/database/migrations/0014_outbox_discarded_events.sql", import.meta.url), "utf8"));
      const rows = await transaction`SELECT discarded_at, published_at FROM showcase_outbox_events WHERE id IN (${ids[0]!}, ${ids[1]!})`;
      expect(rows).toHaveLength(2);
      expect(rows.every(row => row.discarded_at && !row.published_at)).toBe(true);
      throw rollback;
    })).rejects.toBe(rollback);
    await sql`INSERT INTO showcase_outbox_events (id, event_type, event_version, payload, created_at)
      VALUES (${ids[2]!}, 'unapproved', 1, '{"secret":"never-log-this"}', now() - interval '1 second'),
             (${ids[3]!}, 'showcase.session.created', 1, '{}', now())`;
    await worker.runOnce();
    const [invalid] = await sql`SELECT discarded_at, published_at FROM showcase_outbox_events WHERE id = ${ids[2]!}`;
    const [valid] = await sql`SELECT discarded_at, published_at FROM showcase_outbox_events WHERE id = ${ids[3]!}`;
    expect(invalid?.discarded_at).toBeTruthy(); expect(invalid?.published_at).toBeNull();
    expect(valid?.published_at).toBeTruthy(); expect(valid?.discarded_at).toBeNull();
    expect((await new PostgresShowcaseOutbox(sql).pending(25)).some(row => row.id === ids[2])).toBe(false);
    expect(logs.join("")).not.toContain("never-log-this");
  });

  it("retries a controlled synthetic failure into the DLQ", async () => {
    const id = randomUUID();
    await sqs.send(new SendMessageCommand({QueueUrl: queueUrl, MessageBody: JSON.stringify(event(id, "showcase.test.failure"))}));
    for (let attempt = 0; attempt < 5; attempt++) await worker.runOnce();
    expect(logs.join("")).toContain("WorkerFailure");
    const dlq = await sqs.send(new ReceiveMessageCommand({QueueUrl: dlqUrl, WaitTimeSeconds: 2, MaxNumberOfMessages: 10}));
    expect(dlq.Messages?.some(message => JSON.parse(message.Body!).event_id === id)).toBe(true);
    expect(await sql`SELECT event_id FROM showcase_worker_inbox WHERE event_id = ${id}`).toHaveLength(0);
  });
});
