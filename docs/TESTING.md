# Testing and quality gates

## Classroom AWS checks

The active deployment root is `infra/classroom`. Its mocked test verifies one small EC2 instance, one private disposable RDS instance, restricted ingress, a force-destroy S3 bucket, one-day CloudWatch retention, and SES-only IAM. It creates no AWS resources. Run `npm run classroom:check`; after provider initialization, formatting, validation, and mocked tests run in networking-disabled Terraform containers.

For an approved live demonstration, `npm run classroom:aws -- smoke` must prove hosted authentication, console access, keys, sessions, ownership, revocation, direct worker completion, an S3 artifact, SES simulator acceptance, and CloudWatch API/worker streams. `status` lists the five demonstrated resources and deadline. After `destroy`, independently verify the EC2 instance/EIP, RDS instance/snapshots, S3 bucket/objects, CloudWatch log group, and project IAM/VPC resources are absent.

## Test layers

| Layer | Purpose | Required examples |
| --- | --- | --- |
| Unit | Deterministic rules without network I/O | secret generation, digest matching, expiry, revocation, ownership, payload redaction |
| Integration | Real local adapters | PostgreSQL transactions, Redis limits/cache, outbox lease, SQS deduplication, S3 artifact shape, SES sandbox adapter |
| Contract | Stable HTTP boundary | schemas, statuses, error shape, cookie flags, CSRF, Origin, authorization, `Cache-Control` |
| End-to-end | User-visible and event journey | console, API-key lifecycle, session lifecycle, worker result, DLQ path |
| Security | Prevent leaks and bypasses | log redaction, wrong-key access, CSRF, CORS, SQL input, request bounds, IAM assumptions |
| Infrastructure | Prove AWS evaluation and deletion | Terraform validation, required resources, encryption, private data services, destroy plan |

Local integration and end-to-end tests use disposable PostgreSQL, Redis, and LocalStack or equivalent service emulators. Remote smoke tests use the real temporary AWS environment, SES sandbox or mailbox simulator, and synthetic data only.

## Mandatory end-to-end journey

1. Start with empty temporary stores and confirm the console state is empty.
2. Repeat invalid console access until the configured Redis-backed limit returns `429`, without secret-bearing logs.
3. Unlock the console and assert cookie flags, the returned CSRF token, and `Cache-Control: no-store` on the login response.
4. Reject a console mutation with a missing token, incorrect token, or untrusted Origin using `403 invalid_csrf`.
5. Create an API key, assert its one-time secret response has `Cache-Control: no-store`, and confirm list responses show only metadata and prefix.
6. Create a session for `demo-user-1`, assert its token response has `Cache-Control: no-store`, and validate it with the creating API key.
7. Attempt validation and revocation with a different API key and confirm the session is undiscoverable.
8. Revoke a session through the console, then through the owning API-key path, and confirm both are idempotent and validation fails.
9. Create another session, revoke its API key, and confirm the key and owned sessions fail immediately.
10. Advance controlled time and confirm browser/application-session expiry and Redis cache invalidation behavior.
11. Confirm the outbox event reaches SQS, duplicate delivery causes one worker effect, the S3 artifact is redacted, SES uses only sandbox/simulator mode, and CloudWatch receives the expected metric.
12. Force a synthetic worker failure through its retry budget and confirm DLQ visibility without exposing secrets.

## Security checks

- Raw access codes, cookies, CSRF tokens, API keys, session tokens, digests, subjects, and authorization headers never appear in logs, events, artifacts, metrics, traces, or error responses.
- Console cookie and CSRF behavior exactly matches `API_CONTRACTS.md`.
- SQL is parameterized and request schemas bound body size, label length, TTL, key count, and session count.
- Redis failure cannot grant access. Console login fails closed when its limiter is unavailable.
- RDS, Redis, and S3 are not publicly accessible. IAM task roles are separated between API and worker.
- KMS encryption and Secrets Manager references are present in the Terraform plan.
- WAF, CloudFront, ALB, and CORS allow only the documented showcase path.

## Deployment smoke test

Run the mandatory journey against the temporary HTTPS URL. The health endpoints alone are not proof that the showcase works. Verify every AWS service listed in `AWS_DEPLOYMENT.md` through API output, CloudWatch, AWS resource state, or Terraform state without exposing secrets.

## Teardown verification

After the showcase, run Terraform destroy and verify there is no retained AuthForge RDS instance or snapshot, ElastiCache cluster, SQS queue or DLQ, S3 object or bucket, Secrets Manager secret, KMS alias or project key scheduled outside the approved deletion path, ECS service or task, ECR image, ALB, WAF resource, CloudFront distribution, Route 53 record, or CloudWatch log group.

## Quality gates

Every change must pass formatting, lint/type checks, unit tests, and affected integration tests. Public endpoints require contract and end-to-end tests. Schema, Redis, event-worker, or infrastructure changes require their specialized tests and the security checks above.

Flaky tests are defects. Use a controllable clock and deterministic secret stubs in unit tests. End-to-end tests may use real secure randomness but must never print generated secrets.

## Reproducible local checks

These commands use only loopback services and free LocalStack Community. No AWS credentials or cloud account are needed. The dedicated test stack has no persistent database volume and uses separate ports from the demo.

```bash
npm ci
npm run build
npm run lint
npm test
docker compose -p authforge-test -f compose.test.yaml up -d --wait
npm run test:integration
npx playwright install chromium
npm run test:browser
docker compose -p authforge-test -f compose.test.yaml down --volumes
```

`npm test` skips integration suites unless `AUTHFORGE_LOCAL_INTEGRATION=true`. `npm run test:integration` explicitly opts into the disposable test ports (PostgreSQL 55432, Redis 56379, LocalStack 54566), applies the full migration chain, and verifies real transactions, capacity, rollback, cache hints, worker artifacts, simulator email, and DLQ delivery. Run it before browser tests to prepare the test database. Browser tests run the API on port 8081 and never record screenshots, videos, or traces containing credentials.

The hosted-auth contracts verify Argon2id storage, domain and password bounds, generic login errors, duplicate registration, cookie flags, CSRF/Origin, one-hour expiry, throttling, atomic registration, and secret-free logs. Browser checks verify reload and sign-out plus console key/session lifecycle and dialog keyboard behavior.

The cancellation regression creates an isolated test key, dismisses its revocation dialog through Cancel, Escape, and the backdrop, then visits every console section. It asserts that no key-revocation request was sent, the key metadata remains active, and the key still authenticates. It also checks that a dismissed dialog cannot execute a stale pending action.

Terraform can be formatted and validated without contacting an AWS account:

```bash
terraform -chdir=infra fmt -check
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
```

A valid configuration is not proof of a real AWS deployment. Remote HTTPS/IAM/KMS/WAF/SES checks and full AWS teardown remain unverified until a separately approved paid evaluation. Local teardown is verified by checking the test Compose project has no containers or volumes after `down --volumes`.

For the running demo Compose project, `npm run demo:check` exercises the actual HTTP API and waits for worker completion. It uses synthetic data, revokes its keys and sessions, and prints no secrets.

## Offline AWS configuration tests

`bash scripts/infra-check.sh --init` downloads Terraform plugins and runs checks. Subsequent `npm run infra:check` runs formatting, validation, and mocked-provider scenarios with container networking disabled. Cases cover disabled services before migration, one API/worker from a shared image, private encrypted data services, DNS sender verification, disposable retention, and rejection of real recipients or mutable image tags. No AWS credentials are mounted and no real resources are created. Mocked IAM policy-document data is not a substitute for a real IAM smoke test.

The future migration helper is tested as a pure request builder and as a guarded CLI process with an empty PATH. Running `npm run aws:migrate` without `AUTHFORGE_ALLOW_BILLABLE_AWS=yes` exits before any AWS call. This helper has not been run against AWS. Real migration, deployment, and destroy verification require separate explicit approval.

## Verified checkpoint — 2026-10-25

The current source passed build/lint, 90 unit/contract tests, seven local integration tests, four browser journeys, all five offline Terraform scenarios, a non-root container/trust-bundle check, and the complete local HTTP/worker smoke test. Browser tooling was restored in temporary storage before the browser run. These results do not verify real AWS deployment or teardown; see `WORK_CHECKPOINT.md` and `AWS_RUNBOOK.md` for that boundary.

## Workload isolation regression checks

Configuration tests start worker and migration loaders without console credentials or Redis, verify that unrelated authentication inputs are stripped, and retain deployed database TLS and simulator restrictions. The worker integration journey uses `loadWorkerConfig` without API secrets. The offline Terraform isolation scenario checks each task's injected secret names, execution-role secret ARN allowlists, separate role instances, and API-only environment exclusion. The actual Secrets Manager/KMS permission boundary still requires the future approved AWS smoke test.

## Pre-merge regressions

Proxy contracts exercise console and hosted login behind the two-hop AWS chain, change spoofed forwarded prefixes, and require the same rate-limit bucket; local mode ignores forwarding headers. Worker tests cover terminal discard of legacy/invalid envelopes, continued publication, and retryable transport failure. Local PostgreSQL integration checks the forward migration against pending legacy events and verifies discarded events never enter SQS.
