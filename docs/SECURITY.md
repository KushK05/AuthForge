# Security

## Security posture

AuthForge is a short-lived AWS showcase and must never be presented as production-ready authentication. Only synthetic demonstration identifiers may enter the system.

Do not collect names, real email addresses, passwords, phone numbers, payment data, production API keys, customer identifiers, or other personal or business data. Temporary persistence in RDS, Redis, S3, SQS, SES, and CloudWatch is permitted only for synthetic evaluation data and must end with stack teardown.

## Threat controls

| Threat | Required control |
| --- | --- |
| Console exposure | Strong Secrets Manager access code, HTTP-only cookie, exact Origin allowlist, required CSRF token, and Redis-backed failed-attempt limits. |
| API-key leakage | Secure generation, one-time reveal, keyed digest in PostgreSQL, display prefix, revocation, log redaction, and `Cache-Control: no-store`. |
| Session-token leakage | Opaque random token, one-time reveal, keyed digest, short TTL, ownership checks, and revocation. |
| Cross-key access | Resolve session ownership in PostgreSQL and make other keys' sessions undiscoverable. |
| Injection and XSS | Request schemas, parameterized SQL, output encoding, strict content security policy, and bounded input lengths. |
| CSRF | Exact trusted Origin plus `X-CSRF-Token` matched to the console session for every cookie-authenticated mutation. |
| Network exposure | CloudFront and ALB HTTPS, ACM certificates, WAF managed rules, private ECS/RDS/Redis subnets, and narrow security groups. |
| AWS data leak | Least-privilege IAM, KMS encryption, secret references, redacted queue/artifact payloads, and no public S3 access. |
| Resource exhaustion | WAF rules plus bounded request body, TTL, key count, session count, and authentication attempts. |
| Retention after evaluation | No final RDS snapshot, short log and S3 lifecycles, empty-bucket teardown, secret deletion, and verified Terraform destroy. |

## Credential handling

- Use the platform cryptographic random generator for API keys, console cookies, CSRF tokens, and session tokens.
- Use a Secrets Manager value as the keyed hashing input for credential digests.
- Compare digests with timing-safe primitives.
- Return raw API keys and session tokens only once with `Cache-Control: no-store`.
- Never put raw credentials, subjects, access codes, or secret-bearing bodies in SQS, S3, SES, logs, metrics, or traces.
- Revoking an API key revokes its sessions in the same PostgreSQL transaction.

## AWS security baseline

CloudFront, the public ALB, and WAF form the public edge. API and worker tasks, RDS, and ElastiCache run in private subnets. RDS and Redis have no public ingress. Security groups permit only the explicit API-to-data and worker-to-service paths.

Use separate least-privilege ECS task roles. The API role may access the database secret, Redis, and required KMS operations but does not send SES mail or write S3 artifacts. The worker role consumes SQS, writes the dedicated S3 prefix, invokes SES sandbox, and emits CloudWatch telemetry.

KMS encrypts Secrets Manager values, RDS storage, Redis where supported, SQS, S3, and CloudWatch log groups. S3 blocks public access and requires TLS. CloudTrail remains an AWS account control but is not an AuthForge application data store.

## SES and synthetic data

SES remains in sandbox or mailbox-simulator mode. Do not verify or send to a real recipient for this showcase. Any message uses fixed synthetic content and contains no raw key, token, subject, or access code.

## Logging and retention

Logs may include request ID, route, method, status, latency, API-key prefix, synthetic record IDs, AWS request ID, and error code. Do not log subjects by default.

Set CloudWatch and S3 retention to the shortest period accepted by the evaluation, then delete both during teardown. Disable RDS deletion protection and automated backups for the temporary stack. Skip the final snapshot.

## Honest limitations

- The service is not designed for real identities or public production use.
- Availability depends on one small API task and one small worker task.
- No disaster recovery or retained backup exists.
- Destroying the AWS environment permanently deletes all AuthForge state.
- Passing the showcase security checks does not establish production readiness.
