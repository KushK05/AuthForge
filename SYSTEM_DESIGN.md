# System design

## Problem and actors

AuthForge serves two distinct audiences:

- **Developers** administer an organization and create projects. A project is the tenancy boundary for end-user identity data.
- **End users** sign up and authenticate to a specific developer project through the hosted UI or API.

The platform must issue credentials that a developer application can validate, while ensuring data and privileges never cross project boundaries.

## System context

```text
Developer console / developer backend          End-user client
              |                                      |
              +------------ HTTPS -------------------+
                                     |
                              WAF + load balancer
                                     |
                              AuthForge API
                    /-----------|------------\
                   /            |             \
             PostgreSQL        Redis          SQS
             source of truth  rate limits      |
                    |                            v
                    +----------------------> Worker -> SES
                    |
                    +----------------------> S3 audit archive
                                     |
                               CloudWatch / alarms
```

## Primary flows

### Sign-up and verification

1. Client supplies the project publishable key, email, password, and optional idempotency key.
2. API resolves the project from the key, applies per-project and per-IP rate limits, validates the redirect target, and hashes the password.
3. One PostgreSQL transaction creates the user in `pending_verification`, creates a verification-token record, writes the audit event, and writes an outbox event.
4. The worker converts the outbox event to an SQS email job and sends the verification link through SES. Retries do not create new users or tokens.
5. The verification endpoint consumes the opaque token exactly once and marks the email verified. It may then create a session depending on the endpoint flow.

### Sign-in, session refresh, and sign-out

1. Sign-in resolves project scope from a publishable key, rate-limits the attempt, verifies Argon2id password hash, and rejects disabled or unverified users according to project policy.
2. API creates a durable session, generates an opaque refresh-token family member, stores only its hash, and returns an access JWT plus raw refresh token using the documented transport.
3. Refresh atomically consumes the submitted token, revokes it, creates the successor, and emits a new access JWT. Reuse of a consumed refresh token revokes the entire family and returns `401`.
4. Sign-out revokes the current session or all sessions, records an audit event, and returns success even if the session was already revoked.

### Developer administration

Developer console endpoints require a developer session and a platform role. A developer organization owns projects. Each project has independent environments, key material, redirect allowlists, users, roles, sessions, and audit trail. Secret API keys only authenticate server-to-server management calls and never mint an end-user session.

### Authorization check

The API embeds `sub`, `project_id`, `sid`, `roles`, token version, issuer, audience, expiration, and key ID in the access JWT. Resource services validate signature and standard claims, then must enforce project matching and permission checks. A role claim is a short-lived authorization snapshot, not a reason to skip server-side checks for privileged mutations.

## Invariants

1. A user identity, session, role, token, audit event, and credential belongs to exactly one project unless explicitly global in the data model.
2. A refresh token is never usable more than once. Token-family replay revokes the family.
3. Credential secrets are displayed only at creation time and are never recoverable afterwards.
4. User-visible state transitions and their audit event occur in the same database transaction.
5. A successful HTTP response for a state change means durable state has committed. Email and archival effects may happen later.
6. Queue delivery is at-least-once. No handler may rely on exactly-once transport.
7. Failure of Redis cannot grant access or bypass rate limits. The API uses a conservative fallback limit.
8. Failure of email delivery does not verify an email, reset a password, or roll back a durable account state.

## Service objectives and capacity assumptions

Initial target: 100 developer projects, 10,000 monthly active end users, and a peak of 50 API requests/second. The system should sustain a 10x burst for five minutes without data loss.

| Objective | Target |
| --- | --- |
| Public API availability | 99.5% monthly in v1 |
| Sign-in p95 latency | under 500 ms excluding client network |
| Token refresh p95 latency | under 250 ms |
| Email dispatch delay p95 | under 5 minutes |
| RPO | 24 hours in development; 1 hour in production |
| RTO | 4 hours in v1 production |

## Failure handling

The API returns a typed error and correlation ID for any failed request. Transaction failures produce no partial state. Transient worker failures are retried with exponential backoff; non-transient or exhausted jobs enter the DLQ and alarm. SES suppression, invalid recipients, and template failures are audited and exposed to operators without exposing recipient PII. PostgreSQL unavailability makes mutating authentication flows unavailable rather than accepting speculative state.

## Observability requirements

Every request receives a correlation ID. Structured logs include timestamp, environment, request ID, module, route, status, latency, project pseudonym, and error code. Metrics include sign-up/sign-in success rate, authentication failure classifications, token-refresh replay count, rate-limit rejections, queue age, DLQ depth, worker retries, RDS connection utilization, and email send outcome. Traces span API, outbox, worker, and SES call, with secrets redacted.
