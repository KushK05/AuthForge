# Testing and quality gates

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
10. Advance controlled time and confirm API-key/session expiry and Redis cache invalidation behavior.
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
