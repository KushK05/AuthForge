# Security

## Security posture

AuthForge handles credentials and identity data. Security invariants take priority over convenience, latency, and feature scope. Treat every client, redirect URL, queued payload, environment variable, and cross-project identifier as untrusted until verified.

## Threat controls

| Threat | Required control |
| --- | --- |
| Cross-tenant access | Project scope derived from verified credential, project predicate on every query, composite foreign keys where possible, and negative integration tests. |
| Credential stuffing | WAF managed rules, Redis rate limits by IP/email/project, generic sign-in errors, audit and alerting. |
| Password compromise | Argon2id, minimum length policy, breach-password screening when added, TLS only, no password logging. |
| Refresh-token theft/replay | Opaque hashed tokens, rotation on every use, single-use atomic consume, family revocation on replay, short access-JWT lifetime. |
| JWT forgery/key exposure | Asymmetric signing, KMS-controlled signing key, JWKS `kid`, issuer/audience validation, key rotation overlap. |
| API-key leakage | One-time reveal, hashed storage, scoped keys, prefix identification, revocation, secret scanning in CI. |
| Open redirect | Exact normalized redirect allowlist per project/environment; HTTPS required except local development. |
| Async data leak | Minimal SQS payloads, redaction, least-privilege worker roles, DLQ access restricted. |
| Injection/XSS/CSRF | Parameterized queries, strict validation, output encoding, secure cookies, CSRF protection for cookie-authenticated mutations, CSP for hosted UI. |

## Authentication and token requirements

- Password hashing uses Argon2id with centrally configured memory, iteration, parallelism, and salt parameters. Parameters are versioned for later rehashing.
- Verification and reset tokens contain at least 256 bits of randomness, have short expirations, are single-use, and are stored only as hashes.
- Email workers derive the opaque token from its record ID through a KMS-backed HMAC key; raw tokens are neither persisted nor placed in outbox or SQS payloads.
- Access JWT lifetime defaults to 15 minutes. Use an asymmetric key controlled by KMS. The signing private key is never exported to app containers.
- Refresh tokens default to 30 days, with an absolute family lifetime of 90 days. Store them as opaque hashed values. Reuse triggers family and session revocation, an audit event, and an alert threshold.
- Password reset invalidates all sessions and increments `token_version`. Administrative disablement also increments it and revokes sessions.
- Developer secret keys are generated from cryptographically secure randomness, scoped, expirably configurable, and shown once.

## AWS security baseline

Public load balancer and WAF are in public subnets. API, worker, RDS, and Redis run in private subnets. RDS and Redis do not accept public traffic. Security groups permit only explicit caller-to-service paths. Use IAM roles for workloads, least-privilege policies, VPC endpoints for AWS services where justified, KMS encryption for RDS, S3, SQS, and Secrets Manager, and CloudTrail for account audit. Separate AWS accounts for development, staging, and production when the project reaches shared use; at minimum separate environments and credentials from day one.

Secrets live in Secrets Manager, rotated where supported. IaC may contain secret ARNs, never secret values. CI uses short-lived federated AWS credentials rather than stored cloud keys. Production break-glass access is individually attributable, time-bound, logged, and reviewed.

## Logging, privacy, and retention

Use an allowlist for logs. Hash or pseudonymize project and user identifiers when operators do not need raw values. Never log authorization headers, cookies, passwords, raw tokens, raw API keys, reset URLs, SQL parameters containing PII, or full email addresses. Encrypt backups and S3 archives. Audit records contain action context, not secrets. Define retention before collecting new personal data; provide deletion workflow requirements before adding profile data beyond email.

## Incident actions

For suspected key compromise: revoke affected API keys or signing key, rotate secrets, invalidate sessions if required, preserve logs, assess project scope, and notify impacted developers through the documented process. For refresh replay: revoke the family automatically, record the event, and require sign-in. For potential tenant isolation failure: stop affected privileged operations, preserve evidence, determine data scope, remediate, and conduct a post-incident review before re-enabling.

Security-sensitive changes require threat-model review, dependency scanning, secret scanning, test evidence, and explicit approval before production deployment.
