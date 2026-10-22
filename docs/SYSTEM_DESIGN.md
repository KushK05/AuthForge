# System design

## Purpose and actors

AuthForge demonstrates a small authentication workflow and a complete AWS integration path without operating a real identity platform.

- The showcase operator opens the developer console, creates API keys, and observes or revokes sessions.
- A demo application backend uses an API key to create and validate sessions for synthetic subjects.
- The worker demonstrates durable asynchronous handling through SQS, SES sandbox, S3, and CloudWatch.

There are no developer accounts and no end-user accounts. A subject such as `demo-user-1` is only a synthetic session label.

## System context

```text
Operator / demo backend
          |
Route 53 + CloudFront + ACM
          |
       WAF + ALB
          |
   ECS Fargate API
      /        \
 RDS PostgreSQL Redis
      |
   outbox
      |
 SQS + DLQ -> ECS Fargate worker -> SES sandbox
                          |
                          +-------> S3 artifacts
                          |
                          +-------> CloudWatch
```

ECR stores the image. KMS, Secrets Manager, and IAM protect the environment. Terraform creates and destroys it.

## Primary flows

### Console access

1. The operator submits the deployment-scoped access code.
2. The API reads the configured secret, checks the Redis-backed failure limit, and compares the value safely.
3. A short-lived console session and CSRF digest are stored in PostgreSQL.
4. The API returns a secure cookie and one-time CSRF token.
5. Console mutations require the cookie, exact trusted Origin, and CSRF header.

No developer profile or durable account is created.

### API-key lifecycle

1. The operator creates a named API key in the console.
2. One transaction stores its digest and a redacted outbox event.
3. The API returns the raw key once.
4. The worker publishes and consumes the event, writes a redacted S3 artifact, emits CloudWatch telemetry, and exercises SES sandbox if configured.
5. Revoking the key also revokes all sessions owned by it.

### Session lifecycle

1. The demo backend submits a synthetic subject and bounded TTL using an API key.
2. The API stores a session-token digest and outbox event in one transaction.
3. The backend validates the raw token using the same API key.
4. Validation checks key status, ownership, session status, and expiry, using Redis only as a short-lived cache.
5. The owning API key or the console operator can revoke the session.

### Event and failure demonstration

The worker handles duplicate SQS delivery idempotently. A controlled failing event is retried and then moved to the DLQ so evaluators can see queue failure handling without real user impact.

### Teardown

Terraform destroy removes the application services, databases, cache, queues, buckets, secrets, logs, networking resources, and synthetic data. No final database snapshot or retained application backup is created.

## Invariants

1. Only synthetic data enters the system.
2. PostgreSQL is authoritative only for the lifetime of the temporary stack.
3. Every application session belongs to one API key.
4. Raw credentials are revealed once and never persisted or logged.
5. Expired or revoked credentials cannot authenticate.
6. Every state mutation and its outbox event commit together.
7. SQS delivery is at-least-once and worker effects are idempotent.
8. Redis loss cannot grant access.
9. Stack teardown deletes all AuthForge data and resources.

## Showcase success criteria

The project is complete when evaluators can observe:

1. Console access protected by Secrets Manager, CSRF, and Redis rate limits.
2. API-key creation, one-time reveal, authentication, and revocation.
3. Session creation, validation, expiry, ownership enforcement, and revocation.
4. PostgreSQL records and Redis cache behavior for synthetic data.
5. SQS event delivery, worker processing, SES sandbox integration, S3 artifact creation, and CloudWatch telemetry.
6. A controlled DLQ failure.
7. Terraform teardown with no retained AuthForge data resource.

There is no production throughput, availability, recovery-point, or recovery-time objective.

## Observability

CloudWatch dashboards show ALB request count, API errors and latency, ECS task health, RDS connections, Redis errors, SQS age and depth, DLQ depth, worker success/failure, SES sandbox results, and S3 artifact writes. Telemetry uses synthetic IDs and never raw credentials or subjects.
