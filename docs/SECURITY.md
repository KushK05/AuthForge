# Security

## Classroom deployment boundary

The active classroom stack exposes HTTP port 8080 only to the operator-supplied IPv4 CIDR in `allowed_cidr`. A classroom `/32` is preferred; `0.0.0.0/0` is permitted for a public demo under ADR-013, and IPv6 or non-CIDR values are rejected. It is a short-lived classroom demonstration, not a public production endpoint. EC2 runs the API, direct-outbox worker, and disposable Redis container. RDS is not publicly accessible and accepts PostgreSQL only from the EC2 security group.

Generated database, console, and digest secrets exist only in ignored local Terraform state and EC2 user data/environment files during the demonstration. S3 blocks public access and uses server-side encryption. The EC2 role is limited to classroom bucket objects, the classroom CloudWatch log group, the fixed SES sender, the simulator recipient, and one explicitly configured SES-verified test inbox. No arbitrary recipient is permitted.

The classroom URL uses plain HTTP because the five-service limit excludes ACM, Route 53, CloudFront, and ALB. With public ingress, the console access code, cookies, and demo passwords cross the internet unencrypted, so treat them as observable, use only synthetic data, and rely on the existing login and registration rate limits. RDS, S3, and SES boundaries do not change. Never widen ingress beyond port 8080, enter real data, or present this endpoint as production-ready. Destroy it immediately after the teacher demonstration.

## Security posture

AuthForge is a short-lived AWS showcase and must never be presented as a public production identity service. Only synthetic demonstration identifiers and approved `@authforge.demo` accounts may enter the system.

Do not collect names, real email addresses, phone numbers, payment data, production API keys, customer identifiers, or other personal or business data. Approved demo email and password records are temporary RDS data only; passwords are Argon2id hashes. No user identity data reaches Redis, S3, SQS, CloudWatch, logs, metrics, or traces. SES receives only a fixed configured test inbox and synthetic one-time action links; this verifies access to the inbox, not ownership of the fake `@authforge.demo` address.

## Threat controls

| Threat | Required control |
| --- | --- |
| Console exposure | Strong Secrets Manager access code, HTTP-only cookie, exact Origin allowlist, required CSRF token, and Redis-backed failed-attempt limits. |
| API-key leakage | Secure generation, one-time reveal, keyed digest in PostgreSQL, display prefix, revocation, log redaction, and `Cache-Control: no-store`. |
| Session-token leakage | Opaque random token, one-time reveal, keyed digest, short TTL, ownership checks, and revocation. |
| Demo-account takeover | Approved-domain registration, Argon2id password hashing, generic sign-in failure, HTTP-only browser cookie, exact Origin, CSRF, and short session expiry. |
| Cross-key access | Resolve session ownership in PostgreSQL and make other keys' sessions undiscoverable. |
| Injection and XSS | Request schemas, parameterized SQL, output encoding, strict content security policy, and bounded input lengths. |
| CSRF | Exact trusted Origin plus `X-CSRF-Token` matched to the console session for every cookie-authenticated mutation. |
| Network exposure | CloudFront and ALB HTTPS, ACM certificates, WAF managed rules, private ECS/RDS/Redis subnets, and narrow security groups. |
| AWS data leak | Least-privilege IAM, KMS encryption, secret references, redacted queue/artifact payloads, and no public S3 access. |
| Resource exhaustion | WAF rules plus bounded request body, TTL, key count, session count, and authentication attempts. |
| Retention after evaluation | No final RDS snapshot, short log and S3 lifecycles, empty-bucket teardown, secret deletion, and verified Terraform destroy. |

## Credential handling

- Use the platform cryptographic random generator for API keys, console cookies, CSRF tokens, and session tokens.
- Hash demo-user passwords with Argon2id. Never log, queue, cache, email, or expose a password hash.
- Use a Secrets Manager value as the keyed hashing input for credential digests.
- Compare digests with timing-safe primitives.
- Return raw API keys and session tokens only once with `Cache-Control: no-store`.
- Never put raw API keys, session tokens, passwords, subjects, or access codes in SQS, S3, logs, metrics, or traces. SES account-action messages may contain only the one-time verification/reset link sent to the configured test inbox; lifecycle messages remain on the mailbox simulator.
- Revoking an API key revokes its sessions in the same PostgreSQL transaction.

## AWS security baseline

CloudFront, the public ALB, and WAF form the public edge. API and worker tasks, RDS, and ElastiCache run in private subnets. RDS and Redis have no public ingress. Security groups permit only the explicit API-to-data and worker-to-service paths.

Use separate least-privilege ECS task roles. The API role may access the database secret, Redis, required KMS operations, and SES `SendEmail` constrained to the configured sender and test recipient; it does not write S3 artifacts. The worker role consumes SQS, writes the dedicated S3 prefix, invokes SES sandbox, and emits CloudWatch telemetry.

KMS encrypts Secrets Manager values, RDS storage, Redis where supported, SQS, S3, and CloudWatch log groups. S3 blocks public access and requires TLS. CloudTrail remains an AWS account control but is not an AuthForge application data store.

## SES and synthetic data

Lifecycle-event email remains in sandbox/mailbox-simulator mode. Registration verification and password-reset email are the explicitly approved exception: SES may send only to the single configured, SES-verified test inbox. The `@authforge.demo` address is a synthetic account label and is never the SES destination. The link places a cryptographically random one-time token in the URL fragment, so browsers do not send it in the initial HTTP request; its keyed digest alone is stored in PostgreSQL; verification expires after one hour and reset after 15 minutes. Reset revokes existing browser sessions. Never log tokens, full links, passwords, or message bodies. Keep SES sandbox enabled and never configure production access or arbitrary recipients.

## Logging and retention

Logs may include request ID, route, method, status, latency, API-key prefix, synthetic record IDs, AWS request ID, and error code. Do not log subjects by default.

Set CloudWatch and S3 retention to the shortest period accepted by the evaluation, then delete both during teardown. Disable RDS deletion protection and automated backups for the temporary stack. Skip the final snapshot.

## Honest limitations

- The service is not designed for real identities or public production use.
- Availability depends on one small API task and one small worker task.
- No disaster recovery or retained backup exists.
- Destroying the AWS environment permanently deletes all AuthForge state.
- Passing the showcase security checks does not establish production readiness.

## Local demonstration safeguards

Local Compose binds published ports to loopback and sends SQS, S3, and SES requests to LocalStack with dummy credentials. No AWS account or paid LocalStack features are needed. Hosted auth mutations require the trusted Origin and share a Redis-backed attempt limit. LocalStack captures account-action email; the API sends it only to the configured test inbox in a classroom deployment. SES IAM conditions constrain sender and recipient, and the worker remains restricted to the AWS mailbox simulator allowlist.

`TRUST_PROXY` defaults to false locally. When enabled it trusts exactly two hops (ALB and CloudFront), never the entire forwarded chain. The viewer IP is the second address from the right in `X-Forwarded-For`; caller-supplied prefixes cannot change its rate-limit bucket. This requires the documented origin-header-protected ALB path, no shorter public route to the API, and ALB append mode. Verify forwarded client addresses during any future AWS smoke test; reassess this setting before changing the proxy topology.

Worker completion records and transaction-scoped advisory locks prevent concurrent handling and suppress completed duplicates. S3 uses a deterministic event object key. SES does not provide an exactly-once transaction with PostgreSQL: a crash after sending but before recording completion can repeat a simulator message. No real notification or business effect is permitted.

Local tests and containers may be run without cloud charges. Creating an AWS environment is a separate paid action and is not part of local preparation.

## Future AWS runtime checks

Outside local/test environments, configuration requires verified PostgreSQL TLS (`sslmode=verify-full`), Redis TLS, secure cookies, and HTTPS. The image includes the public RDS CA bundle; never disable certificate verification to work around a connection error. Worker deployments require the complete event configuration and cannot use emulator endpoints.

The SES sender is a fixed synthetic infrastructure address under a DNS-verified subdomain of the showcase hostname; it is not a user account or inbox. Terraform verifies the domain through DNS, without recipient email. IAM restricts sending to the configured simulator address as well as the fixed sender.

`evaluation_owner` is a synthetic operator label, and `teardown_at` records the explicit deadline. Tags do not automatically destroy resources. Any future owner must execute and verify teardown. KMS deletion has a seven-day pending-deletion period; no application data or active project key may be retained outside that approved deletion path.

## Workload secret isolation

The API receives `DATABASE_URL`, `CONSOLE_ACCESS_CODE`, and `CREDENTIAL_HASH_KEY`. The worker and run-once migration task receive only `DATABASE_URL`. Each workload has its own ECS execution role with access to its own log group and required Secrets Manager ARNs. Execution-role KMS decryption is restricted to Secrets Manager and those secret ARNs using the [AWS-documented service and encryption-context conditions](https://docs.aws.amazon.com/secretsmanager/latest/userguide/security-encryption.html); application task roles cannot fetch authentication secrets.

Worker configuration validates only database and event settings. Migration configuration validates only database and runtime logging settings. They do not require or return API authentication secrets or Redis settings. Local Compose uses separate optional `.env.worker` and `.env.migrate` files, with `.env` reserved for the API; all are excluded from Git.
