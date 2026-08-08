# Architecture decision records

This is an append-only log. Status values: `accepted`, `superseded`, `proposed`, or `rejected`. A superseding record must link to the decision it replaces.

## ADR-001: Modular monolith with event-driven worker

- Status: accepted
- Context: The project needs clear architecture and realistic distributed-system behavior without microservice operational overhead.
- Decision: Deploy one API and one worker from a shared codebase. Use module boundaries, transactional outbox, SQS, and idempotent consumers.
- Consequences: Strong transactional consistency remains practical for identity/session state. Notification delivery is asynchronous and observable. Future extraction remains possible but is not assumed.

## ADR-002: PostgreSQL is the durable authority; Redis is disposable

- Status: accepted
- Context: Identity, authorization, and session state require integrity and durable auditability.
- Decision: Store all durable state in PostgreSQL. Use Redis only for rate limiting, short-lived cache, and non-authoritative hints.
- Consequences: Redis loss may degrade performance or enforce conservative limits, but cannot create access or lose source data.

## ADR-003: Opaque rotating refresh tokens and asymmetric access JWTs

- Status: accepted
- Context: Clients need low-latency access tokens while AuthForge needs revocation and replay protection.
- Decision: Issue short-lived asymmetric JWT access tokens and opaque hashed refresh tokens with one-time rotation and family revocation on replay.
- Consequences: Validation is scalable through JWKS; refresh requires durable transactional state; authorization changes may take effect after the access-token lifetime unless sessions are revoked.

## ADR-004: SQS plus DLQ for asynchronous work

- Status: accepted
- Context: Email and archival work must not block authentication requests and needs reliable retry behavior.
- Decision: Use transactional outbox publishing to SQS. Each workload has a DLQ and idempotent handler.
- Consequences: Delivery is at-least-once, so consumer inbox/deduplication is mandatory. Operators need DLQ alerts and replay tooling.

## ADR-005: AWS managed services and infrastructure as code

- Status: accepted
- Context: The project must demonstrate cloud deployment while minimizing undifferentiated operations.
- Decision: Use ECS Fargate, RDS PostgreSQL, ElastiCache Redis, SQS, SES, S3, CloudWatch, WAF, KMS, Secrets Manager, ECR, and IaC.
- Consequences: The team learns production cloud boundaries, IAM, networking, monitoring, and scale mechanics without managing control planes.

## ADR template

## ADR-NNN: Title

- Status: proposed
- Date: YYYY-MM-DD
- Context: What concrete problem or evidence requires a decision?
- Decision: The chosen approach and boundaries.
- Alternatives: At least two considered options and why they were not selected.
- Consequences: Operational, security, performance, and maintenance effects.
- Migration and rollback: How existing users/data/deployments remain safe.
- Verification: Tests, metrics, and release gates proving the decision works.
