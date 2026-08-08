# Testing and quality gates

## Test layers

| Layer | Purpose | Required examples |
| --- | --- | --- |
| Unit | Domain rules without I/O | password policy, token expiry, RBAC resolution, redirect normalization, refresh-family state machine. |
| Integration | Real adapters against ephemeral dependencies | Postgres constraints/migrations, Redis limiter behavior, outbox lease, SQS handler deduplication, KMS/SES adapter contracts. |
| API contract | Stable public boundary | schema, status, error code, auth, idempotency, pagination, JWT/JWKS compatibility. |
| End-to-end | User-visible journey through API and worker | sign-up to verification, sign-in to refresh, reset, sign-out, developer project/key lifecycle. |
| Security | Abuse and regression prevention | tenant isolation, replay, key secrecy, auth bypass, rate limits, redirect allowlist, log redaction. |
| Performance | Capacity evidence | sign-in/refresh latency, worker queue drain, connection pool saturation, migration timing. |

Use production-like PostgreSQL and Redis versions in integration and end-to-end tests. Use an email sink and local queue emulator outside AWS. Tests must never require production credentials or send messages to real recipients.

## Mandatory end-to-end journeys

1. Create developer project and environment; reveal secret key once; authenticate a management request; revoke the key; confirm immediate rejection.
2. Sign up with project A, verify through worker-delivered email token, sign in, call `GET /me`, and verify access token against JWKS.
3. Attempt the same email in project B and confirm it is a distinct identity; attempt cross-project resource access and receive no data.
4. Refresh a session successfully, replay the old refresh token, then confirm every token in that family is invalid and the audit event exists.
5. Request a reset for an unknown address and a known address. Confirm indistinguishable external response, no account enumeration, successful known reset, and all prior sessions revoked.
6. Force a transient email failure, verify retry and one final sent state; force permanent failure, verify DLQ entry, alarm, and no accidental verification.
7. Send enough sign-in attempts to hit IP, email, and project rate limits. Confirm Redis failure uses the configured conservative fallback.
8. Deploy a compatible migration, run the API against it, perform a rollback of application code, and verify no schema incompatibility.

## Test data and isolation

Factory helpers must generate unique project, user, session, and credential values per test. Use explicit time control for expiry tests. Never log fixture secrets. Reset data by transaction rollback or isolated disposable databases, not broad destructive operations against shared environments. Seed only non-sensitive synthetic data.

## Release gates

Every change: formatting, lint/type checks, unit tests, and affected integration tests. Public endpoint changes: contract and end-to-end tests. Schema changes: migration validation, upgrade test, and lock-impact check. Queue changes: duplicate-delivery and DLQ tests. Auth/security changes: all security journeys, dependency scan, secret scan, and threat-model review. Infrastructure changes: IaC validation, reviewed plan, and staging smoke test.

## Quality rules

Flaky tests are defects. Quarantine only with an issue, owner, expiry date, and follow-up; do not make a flaky test optional silently. Tests assert externally observable behavior rather than private implementation details. Maintain a small set of smoke tests that run after every deployment and a broader nightly suite with load and restore checks.
