# Software architecture

## Prototype shape

Deploy one public API process and one private worker process from the same repository and container image. The API serves both the developer console and JSON endpoints. The worker publishes outbox records to SQS and consumes synthetic lifecycle events.

```text
Route 53 -> CloudFront -> ALB + WAF -> ECS Fargate API
                                           |
                              RDS PostgreSQL + Redis
                                           |
                                      outbox rows
                                           v
                                  SQS queue + DLQ
                                           |
                                  ECS Fargate worker
                                     /          \
                              SES sandbox       S3

KMS, Secrets Manager, CloudWatch, ECR, and IAM support both tasks.
```

This is a small modular application, not a microservice system. The API and worker share code and release together.

## Product modules

| Module | Responsibility | Must not own |
| --- | --- | --- |
| `developer-console` | Static console UI, access-code exchange, CSRF, and console session | Developer accounts, organizations, teams, billing |
| `api-keys` | Create, list, authenticate, and revoke demonstration API keys | Projects, environments, user permissions |
| `users` | Register and authenticate approved demo users with Argon2id password hashes and short browser sessions | Public onboarding, profiles, email, roles, refresh families |
| `sessions` | Create, validate, list, expire, and revoke sessions for synthetic subjects or approved demo users | Roles, refresh families |
| `showcase-events` | Outbox publication, SQS handling, SES simulator call, and redacted S3 artifact | Real notifications, business workflows, durable audit product |
| `shared` | Configuration, clock, IDs, errors, secret utilities, database and AWS ports | Product workflows |

Modules communicate through application services and narrow repository interfaces. No identity or authorization module is needed.

## State ownership

PostgreSQL is authoritative while the temporary environment exists. It stores console sessions, approved demo users and their browser sessions, API-key metadata and digests, application sessions, outbox events, and worker deduplication records.

Redis is disposable. It stores console-login rate limits, short-lived credential validation cache, and revocation hints. A Redis loss may reduce performance or force conservative rejection, but it must not grant access or lose authoritative state.

S3 stores only redacted synthetic lifecycle-event artifacts used as evaluation evidence. Lifecycle configuration expires them, and Terraform teardown deletes the bucket and contents.

## Transaction and event flow

1. The HTTP boundary validates input, origin, CSRF, and credentials.
2. The application service applies ownership, expiry, and revocation rules.
3. One PostgreSQL transaction writes the state change and a minimal outbox event.
4. A successful response means the temporary PostgreSQL state committed.
5. The worker publishes pending outbox rows to SQS and marks them published.
6. The worker consumes SQS events with completion deduplication, emits CloudWatch metrics, writes a redacted S3 artifact, and optionally calls SES using only a sandbox or simulator recipient.
7. Exhausted event processing enters the DLQ and is visible during evaluation.

Event payloads contain event ID, event type, timestamp, API-key ID, session ID when applicable, and correlation ID. They never contain raw keys, tokens, access codes, subjects, email addresses, or request bodies.

## Suggested code organization

```text
src/
  api/                       Fastify app, routes, schemas, console assets
  worker/                    Outbox publisher and SQS consumer entry point
  modules/
    developer-console/
    api-keys/
    sessions/
    showcase-events/
  platform/                  Config, PostgreSQL, Redis, AWS adapters, migrations
  shared/                    Clock, IDs, errors, cryptography
infra/                       Terraform for the temporary AWS environment
tests/                       Unit, integration, contract, e2e, security
```

## Lifecycle limits

- One API task and one worker task are sufficient for the showcase.
- Only synthetic data exists, and only for the environment lifetime.
- No production availability, recovery, or long-term compatibility objective exists.
- No backup, point-in-time restore, final snapshot, or data migration beyond the temporary schema is required.
- Terraform destroy is the supported deletion workflow.

These limits reduce product complexity while preserving the required AWS integrations.

## Implemented worker boundary

The worker uses the standard SES API supported by the free local emulator. The AWS service set is unchanged. Queue messages use a strict versioned allowlist; arbitrary outbox payload fields are excluded. Correlation defaults to the event identifier when no explicit correlation is present. S3 retains only that redacted envelope, processing time, and the synthetic marker.

Worker concurrency is controlled with PostgreSQL transaction-scoped advisory locks, and completed event IDs are recorded in the inbox. S3 writes are repeatable. SES remains at-least-once across a process crash; see `SECURITY.md`. A `showcase.test.failure` event deliberately fails processing so the SQS redrive policy can demonstrate the DLQ.

`WorkerSuccess`, `WorkerFailure`, and `PublishFailure` log metrics contain no credential or subject. Terraform extracts them into CloudWatch metrics.

## Runtime configuration boundary

`loadConfig` supplies the API configuration. `loadWorkerConfig` supplies only the worker's database/event settings. `loadMigrationConfig` supplies only the migration runner's database/logging settings. The worker and migration processes do not load the API's `.env` file. All three continue to use the same image and codebase, with task-specific secret injection and execution roles.

Invalid outbox envelopes receive a terminal `discarded_at` marker and a redacted `PublishDiscarded` log entry containing only the event ID. Publication continues with later rows; transport failures remain retryable. Legacy refresh/replay events are discarded by forward migration 0014 before startup.
