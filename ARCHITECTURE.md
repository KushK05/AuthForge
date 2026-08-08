# Software engineering and architecture

## v1 shape

Deploy a single stateless HTTP API process and a separate stateless worker process from one repository and one versioned release artifact. They share only source code packages and contracts, not process memory. PostgreSQL, Redis, SQS, SES, S3, and AWS identity are external dependencies. This approach keeps local development and consistency manageable while retaining an asynchronous boundary where it materially matters.

```text
transport (HTTP / SQS)
        |
application services
        |
domain entities and policies
        |
ports: repositories, crypto, clock, queue, mail, object store
        |
adapters: Postgres, Redis, AWS SDK, HTTP framework
```

Dependencies point inward. Domain code must not import HTTP, ORM, Redis, or AWS SDK types. Application services coordinate transactions and permissions. Adapters translate technology errors into stable application errors.

## Modules and ownership

| Module | Owns | May depend on |
| --- | --- | --- |
| `identity` | users, emails, passwords, verification, reset policy | shared, audit port, notification command |
| `sessions` | sessions, refresh-token families, access-token issuance, revocation | identity interface, shared, audit port |
| `authorization` | roles, permissions, memberships, authorization policy | shared, audit port |
| `developer-platform` | developer organizations, projects, environments, keys, redirect allowlists | shared, audit port |
| `notifications` | message templates, outbox dispatch, SQS consumers, SES delivery | shared, identity read interface |
| `audit` | audit-event append and archival selection | shared |
| `shared` | IDs, time, pagination, result/error types, configuration contracts | no business module |

Cross-module interaction uses a narrow application interface, a domain event placed in the outbox, or a query model. Do not create a generic `common` dumping ground. The owning module is the only writer to its tables.

## Transaction and event pattern

For each command, begin a transaction, enforce authorization and domain invariants, write owned records, append the audit event, and append an outbox event. Commit once. A publisher claims pending outbox rows with a lease, sends a stable event envelope to SQS, and marks delivery. Consumers deduplicate using `event_id` in an inbox table before executing effects.

Event envelope fields: `event_id`, `event_type`, `event_version`, `occurred_at`, `project_id` when applicable, `correlation_id`, and a minimal non-secret payload. Event schemas are versioned and additive. Do not send raw credentials or email tokens through SQS; send the record identifier and resolve sensitive material in the worker under least-privilege access.

## Error and configuration architecture

Map domain errors to the problem-details codes in `API_CONTRACTS.md` at the HTTP boundary only. Logging happens at the boundary or worker handler, once, with redaction. Configuration is validated at process start and represented as typed settings. Secrets are referenced by ARN or injected from a secret provider, never committed or printed.

## Code organization recommendation

```text
src/
  api/                 HTTP routes, middleware, request/response schemas
  worker/              queue and outbox entry points
  modules/<module>/
    domain/            entities, value objects, policies, domain events
    application/       commands, queries, ports, transaction orchestration
    infrastructure/    Postgres/Redis/AWS adapters
  platform/            dependency wiring, config, telemetry, migrations
infra/                 environment-independent IaC modules and environment roots
tests/                 unit, integration, contract, e2e, security
```

Exact language and framework are intentionally undecided. Select a mature ecosystem with first-class PostgreSQL migrations, Argon2id, OIDC/JWT support, OpenTelemetry, and test containers or equivalent. Record the choice in `DECISIONS.md` before scaffolding.

## Architecture decision records

The active decisions are indexed in [DECISIONS.md](DECISIONS.md). Any proposal to change a listed decision must include the problem, alternatives, consequences, migration, rollback, and verification plan. Decision records are append-only; supersede rather than rewrite accepted decisions.

## Extraction criteria

Extract a module to a separate service only when all are true: its operational profile differs materially, it has a stable contract and owner, it is constrained by independent scaling or release needs for at least two iterations, and the team can support independent deployments, dashboards, alerts, schema migration, replay, and failure isolation. Candidate first extraction: notification delivery. Authentication state and session handling remain colocated through v1.
