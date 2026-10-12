# Architecture decision records

This is an append-only log. Status values: `accepted`, `superseded`, `proposed`, or `rejected`. A superseding record must link to the decision it replaces.

## Active decision

ADR-009 is the active project scope. It narrows the product while preserving the AWS services selected in earlier records as evaluation requirements. Earlier records remain historical context where ADR-009 changes their product or retention assumptions.

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

## ADR-006: TypeScript and Fastify application platform

- Status: accepted
- Date: 2026-08-08
- Context: The repository begins without an implementation language or runtime. The API and worker need shared type-safe contracts, PostgreSQL access, Argon2id support, OpenTelemetry compatibility, and a maintainable migration workflow.
- Decision: Use TypeScript on the current supported Node.js LTS line. Implement the public API with Fastify, use the `postgres` driver with SQL migrations, and use Vitest for automated tests. The API and worker remain separate entry points in the same package and release artifact.
- Alternatives: Python/FastAPI and Go were considered. Both are mature options, but TypeScript keeps request validation, application contracts, and infrastructure-adapter interfaces in one strongly typed ecosystem while Fastify provides a small explicit HTTP boundary.
- Consequences: Runtime configuration and untrusted HTTP inputs can be validated with shared schemas. SQL remains visible and database ownership boundaries are easier to audit. Dependencies must be kept current and production images must use a supported Node.js LTS release.
- Migration and rollback: There is no existing runtime or persisted data. Future schema changes remain forward-only SQL migrations and application releases remain independently rollbackable when migrations are compatible.
- Verification: Type checking, linting, unit tests, integration tests against PostgreSQL, contract tests for public endpoints, and the journeys in `TESTING.md` gate future work.

## ADR-007: Derived opaque email tokens

- Status: accepted
- Date: 2026-08-09
- Context: Verification and reset tokens must be stored only as hashes and must not appear in outbox or SQS payloads, while a worker must generate the corresponding email link from a record identifier.
- Decision: Each token record receives its UUID before persistence. The opaque token is derived as a versioned UUID plus a 256-bit HMAC output from a KMS-backed derivation key. The complete token is still stored only as a keyed hash. Outbox and SQS carry only token and user record IDs.
- Alternatives: Persisting encrypted raw tokens was rejected because it violates the hash-only token requirement. Putting raw tokens in SQS was rejected because queue payloads are not a secret store.
- Consequences: The worker can reconstruct a valid link under a narrowly scoped derivation-key permission. Rotating the derivation key requires versioned validation support before activation.
- Migration and rollback: No production token records exist. The token format includes a version prefix so a later key version can validate existing records during overlap.
- Verification: Unit tests prove deterministic reconstruction and failed tampering; integration tests prove raw tokens are absent from database, audit, outbox, and queue payloads.

## ADR-008: PS256 KMS access-token keys

- Status: accepted
- Date: 2026-08-19
- Context: Access tokens need an interoperable asymmetric signature and a project JWKS endpoint without private key material entering the application process.
- Decision: Use a KMS RSA `SIGN_VERIFY` key with `RSASSA_PSS_SHA_256` (`PS256`). The API obtains the public key from KMS and publishes it as a JWKS entry whose `kid` is the configured KMS key identifier.
- Alternatives: `RS256` was not selected because RSA-PSS is the stronger default. ECDSA was not selected because KMS returns DER-encoded signatures that require additional JWT signature conversion.
- Consequences: The API role needs only `kms:Sign` and `kms:GetPublicKey`; private keys remain in KMS. Verifiers can cache the public JWKS for the response lifetime. KMS signing availability is required to complete a sign-in.
- Migration and rollback: No production access tokens are issued yet. Future rotations publish old and new key IDs during the maximum access-token lifetime before removing the old key.
- Verification: Unit tests verify the returned JWT signature with the generated public key, and contract tests verify the JWKS response and cache header.

## ADR-009: Replace the production product with a temporary AWS showcase

- Status: accepted
- Date: 2026-10-05
- Relationship: Supersedes the product scope, user-management, token, and long-term retention assumptions in ADR-001 through ADR-008. Retains TypeScript, Fastify, Vitest, the API and worker topology, and the AWS service set from ADR-004 and ADR-005 because those services are part of the evaluation.
- Context: The production-oriented authentication platform is too large and expensive for the project's current purpose. The project now needs a temporary demonstration of a developer console, API keys, session management, and the previously selected AWS services. It will be deployed briefly, evaluated, and terminated. No real data may be used or retained.
- Decision: Keep one API and one worker from the same codebase. Persist only synthetic console, API-key, session, outbox, and worker-deduplication records in temporary RDS. Use Redis, SQS/DLQ, SES sandbox, S3, KMS, Secrets Manager, CloudWatch, ECR, ECS Fargate, WAF, ALB, CloudFront, Route 53, ACM, IAM, and Terraform in the minimal roles defined by `AWS_DEPLOYMENT.md`. Destroy all resources and data after evaluation. Do not implement users, passwords, email lifecycle, RBAC, multi-tenancy, JWT/JWKS, refresh-token families, billing, or production operations.
- Alternatives: Keeping the complete production feature set was rejected because it does not fit the new scope or cost boundary. Removing the AWS data and messaging services was rejected because those services are evaluation criteria. A static UI mock was rejected because evaluators need real API-key, session, queue, worker, and teardown behavior.
- Consequences: Product code and data remain small, while infrastructure still spans the required AWS services. Synthetic state can survive task restarts during the showcase but is permanently deleted with the stack. The service cannot support real users and must never be represented as production-ready.
- Migration and rollback: There is no production data to migrate. Existing source and infrastructure may be simplified to the new tables, modules, and smallest AWS configurations. Rollback during development may destroy and recreate the temporary environment. Returning to a real identity platform requires a new decision record and new security, data, migration, and operations designs.
- Verification: Contract tests cover the endpoints in `API_CONTRACTS.md`. End-to-end tests prove console access, CSRF, key lifecycle, session lifecycle, ownership, expiry, revocation, outbox and SQS handling, SES sandbox, S3 redaction, CloudWatch evidence, DLQ behavior, and complete Terraform teardown without retained AuthForge data.

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
