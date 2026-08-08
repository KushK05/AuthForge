# AuthForge agent instructions

These files are the authoritative project directions. Read `README.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, `DATA_MODEL.md`, `SECURITY.md`, and the relevant sections of `AWS_DEPLOYMENT.md` before changing behavior. When documents conflict, resolve in this order: `SECURITY.md`, `API_CONTRACTS.md`, `DATA_MODEL.md`, `ARCHITECTURE.md`, then the remaining documents. Raise the conflict instead of guessing.

## Non-negotiable v1 architecture

- Build one deployable API and one deployable worker from the same codebase. The worker consumes queues and never serves public HTTP.
- Preserve modules: `identity`, `sessions`, `authorization`, `developer-platform`, `notifications`, `audit`, and `shared`. Modules expose application services and interfaces, not database internals.
- PostgreSQL is authoritative for durable data. Redis is disposable and may hold only rate-limit counters, short-lived caches, and revocation hints that fail safely.
- SQS transports durable asynchronous commands. Handlers must be idempotent. Every queue has a dead-letter queue.
- Use synchronous transactions for state changes and an outbox record in that same transaction. A worker publishes outbox records after commit.
- Never place passwords, refresh tokens, API keys, raw JWTs, email-reset tokens, or unredacted PII in logs, metrics, traces, SQS payloads, or audit metadata.

## Change discipline

1. State which documented invariant or contract the change affects.
2. Make the narrowest change that meets the request. Do not add a framework, service, queue, database, cache, or cloud product without a concrete need.
3. Update the affected Markdown contract in the same change when behavior, schema, interface, architecture, deployment, or security posture changes.
4. Add a dated record to `DECISIONS.md` before changing a foundational decision: module topology, consistency model, token strategy, storage technology, AWS boundary, or public API version.
5. Do not silently convert the modular monolith into microservices. Propose the split with workload evidence, ownership, data-migration plan, observability plan, rollback plan, and an approved decision record.

## Implementation rules

- Derive tenant/project scope from trusted credentials or a verified JWT. Do not accept an arbitrary tenant identifier as sufficient authorization.
- Every tenant-owned database query must include `project_id` or an equivalent tenant predicate. Add tests that prove cross-project data is unavailable.
- Hash passwords with Argon2id using centrally configured parameters. Hash opaque tokens and secret API keys before persistence. Store only a display prefix for keys.
- Access JWTs are short-lived and signed with an asymmetric KMS-backed key. Refresh tokens are opaque, single-use, rotated on each exchange, and revoked on replay.
- Validate untrusted input at the HTTP boundary. Use a stable problem-details error shape from `API_CONTRACTS.md`; never leak database errors.
- Require idempotency keys for externally retried create and state-transition requests. Persist the result for the documented retention period.
- Do not access another module's tables directly. Go through its application service or published repository interface.
- Database migrations must be forward-only, reviewable, and compatible with a rolling deployment. Never alter production data with an unreviewed ad hoc script.

## Required verification

Run the smallest relevant unit and integration tests while working, then the affected end-to-end journeys before calling a change complete. For any public HTTP, migration, queue-handler, token, authorization, or infrastructure change, also run the security and contract tests specified in `TESTING.md`. Inspect CI failures rather than bypassing them.

## When to stop and ask

Ask for direction before changing a public contract incompatibly, weakening a security invariant, deleting or backfilling production data, enabling real email delivery, spending materially more on AWS, or making an irreversible infrastructure change. Surface uncertainty explicitly; do not solve it by inventing behavior.
