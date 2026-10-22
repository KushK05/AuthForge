# Prototype roadmap

Build the smallest complete product and AWS evaluation path. A milestone is complete only when its exit criteria and applicable tests pass.

## M0 - narrow the domain

Remove organizations, tenant projects, environments, users, passwords, email verification, password reset, roles, permissions, JWT/JWKS, refresh-token families, and durable audit-product requirements. Keep TypeScript, Fastify, PostgreSQL migrations, Redis, the API/worker topology, and AWS adapters needed by the evaluation.

Exit criteria: docs, source layout, configuration, dependencies, and tests describe only the console, API keys, sessions, showcase events, and required AWS services.

## M1 - console and API keys

Implement access-code exchange, PostgreSQL console sessions, explicit CSRF and Origin checks, Redis login throttling, API-key creation, one-time reveal, listing, authentication, revocation, and redacted logging.

Exit criteria: console protection and API-key lifecycle pass unit, integration, contract, security, and end-to-end tests. Secret responses assert `Cache-Control: no-store`.

## M2 - sessions

Implement session creation, one-time token reveal, validation, listing, expiry, API-key ownership, console revocation, API-key cascade revocation, and short-lived Redis caching.

Exit criteria: expiry, wrong-key validation, both revocation paths, Redis loss, and PostgreSQL authority are tested.

## M3 - AWS event path

Implement transactional outbox records, SQS publishing, idempotent worker consumption, DLQ behavior, SES sandbox invocation, redacted S3 artifacts, and CloudWatch metrics.

Exit criteria: each required AWS integration has automated adapter coverage and a visible synthetic end-to-end result. No raw credential or subject reaches an event payload or artifact.

## M4 - temporary AWS environment

Use Terraform to provision Route 53, CloudFront, ACM, ALB, WAF, ECS Fargate API and worker, ECR, RDS PostgreSQL, ElastiCache Redis, SQS and DLQ, SES sandbox configuration, S3, KMS, Secrets Manager, CloudWatch, IAM, and required networking.

Exit criteria: the full remote journey passes, the dashboard and DLQ demonstration are visible, only synthetic data exists, and the smallest practical resource sizes are documented.

## M5 - showcase and teardown

Rehearse the exact demonstration, capture required evaluation evidence, present it, run Terraform destroy, and verify that no AuthForge database, cache, queue, bucket, secret, task, load balancer, distribution, log group, image, or retained snapshot remains.

Exit criteria: teardown verification passes and the final report states that no real data was used or retained.

## Stop conditions

The prototype is complete after M5. Do not add real user management, non-simulator email, more product features, another deployable service, another AWS product, long-term data retention, multi-region operation, or production hardening without a new scope decision.
