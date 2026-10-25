# Work checkpoint

Resumed and verified on 2026-10-25. Local demo and offline AWS preparation checks pass. No AWS resources have been created and no paid service was started. Changes remain uncommitted in the working tree.

## Completed

- Local signup/sign-in/sign-out, console access, API-key lifecycle, opaque application sessions, ownership, expiry, and revocation.
- PostgreSQL transactions, Redis limits/hints, and LocalStack SQS/S3/SES/DLQ journey.
- Future AWS configuration: private Fargate tasks, RDS certificate verification, Redis TLS, Secrets Manager injection, DNS-verified synthetic SES sender, simulator-only IAM, readiness checks, monitoring, and disposable retention.
- Guarded migration helper and future deployment/teardown runbook in `AWS_RUNBOOK.md`.
- Corrected negative Terraform validation tests to use planning; all five mocked infrastructure scenarios now pass with networking disabled.

## Verification completed

- `npm run build` and `npm run lint`: passed.
- `npm test`: 88 unit/contract tests passed; six integration cases are intentionally skipped in that command and were run separately.
- `npm run test:integration`: six real local PostgreSQL/Redis/LocalStack integration tests passed.
- `npm run test:browser`: four browser journeys passed, including reload, failed sign-out recovery, clipboard copying, and keyboard dialogs.
- `npm run infra:check`: formatting, validation, five mocked Terraform scenarios, and fake-state teardown passed. No real AWS resources are involved.
- `docker compose up --build -d --wait`: passed with the latest source.
- Image inspection: UID 1000 (non-root), 114 parseable public RDS certificates, PostgreSQL driver selects `verify-full` without opening a connection.
- Migration helper guard test passed with an empty PATH and no enabling flag; it exits before invoking AWS or Terraform.
- `npm run demo:check`: actual local HTTP and worker smoke journey passed.
- `git diff --check`: passed.

The temporary browser cache had been cleared since the previous session; a free headless Chromium was restored under `/private/tmp/authforge-playwright` before rerunning browser tests.

## Deployment secret cleanup — 2026-10-25

The API receives its three required secrets. Worker and migration task receive only the database secret and use independent execution roles scoped to their log group and secret ARNs. Execution-role KMS decrypt is restricted to Secrets Manager and matching secret encryption context. Role-specific loaders no longer require API credentials or Redis; Compose and host entry points use separate optional workload environment files. These files are excluded from Git and Docker build context.

Configuration tests and the fifth offline Terraform scenario cover the isolation boundary. The actual local worker and migration container were inspected using assertions that printed no secrets; both lacked API credentials and Redis settings. Runtime IAM enforcement on real AWS remains unverified.

## Future work boundary

Implementation/configuration is prepared for a future AWS evaluation. Actual AWS deployment, IAM permissions, quotas, HTTPS and database TLS handshakes, DNS/SES verification, CloudWatch evidence, and real resource teardown have not been tested. Follow `AWS_RUNBOOK.md` only after explicit cost approval, selection of an existing domain/account/region, and an evaluation owner/deadline.

Do not deploy, purchase anything, send non-simulator email, or run real AWS operations without explicit future approval. Never treat mocked tests as proof of a real deployment. Preserve the uncommitted working tree if continuing later.

## Local demo

Hosted page: http://127.0.0.1:8080/
Console: http://127.0.0.1:8080/console
Public local example access code: `local-showcase-console-access-code`

Stop containers while preserving the temporary local database: `docker compose stop`.
Resume existing containers: `docker compose start`.
Delete all local demo records: `docker compose down --volumes`.

## Pre-merge review fixes — 2026-10-25

- Restricted enabled proxy trust to the two documented CloudFront/ALB hops. Regression tests cover spoofed forwarded prefixes on console and hosted login, distinct real viewers, and forwarding disabled locally.
- Added forward-only migration 0014 with `discarded_at` for outbox events. Pending legacy refresh/replay events are discarded during upgrade; invalid envelopes are discarded by the worker without leaking payloads or blocking valid rows. Transport failures remain pending.
- Verified build, lint, 90 unit/contract tests, seven local PostgreSQL/Redis/LocalStack integration tests, four browser journeys, five offline Terraform scenarios, and the full local demo smoke test. Integration coverage reconstructs the old outbox schema and applies migration 0014 to pending legacy rows.
- Rebuilt the local demo and applied migration 0014 there. Removed the disposable test stack. No cloud deployment, push, or commit was performed. Actual AWS proxy/IAM/TLS/teardown checks remain for the separately approved evaluation.
