# AuthForge

AuthForge is a multi-tenant Authentication-as-a-Service platform for developers. It is a deliberately scoped, Clerk-like project that lets a developer create a tenant project, configure credentials and redirect URLs, and use AuthForge for users, password authentication, email verification, password reset, sessions, JSON Web Tokens (JWTs), refresh-token rotation, roles, permissions, and audit trails.

The initial production architecture is a modular monolith API plus event-driven background workers. It is not a microservice system. Boundaries are enforced in code and in the database so that the system can be split later only when evidence requires it.

## Documentation map

| File | Authority |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Mandatory operating rules for coding agents and contributors. |
| [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) | Product scope, request flows, capacity assumptions, failure modes, and non-functional requirements. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module boundaries, dependency rules, runtime topology, and architecture decision records. |
| [API_CONTRACTS.md](API_CONTRACTS.md) | Versioned HTTP contract, error model, auth schemes, and idempotency requirements. |
| [DATA_MODEL.md](DATA_MODEL.md) | PostgreSQL ownership model, tables, constraints, and migration rules. |
| [SECURITY.md](SECURITY.md) | Threat model, token, credential, tenancy, privacy, and operational-security requirements. |
| [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) | AWS topology, infrastructure as code, environments, deployment pipeline, observability, and scale path. |
| [ROADMAP.md](ROADMAP.md) | Ordered implementation and scaling milestones with exit criteria. |
| [TESTING.md](TESTING.md) | Test pyramid, mandatory end-to-end journeys, fixtures, and release gates. |
| [DECISIONS.md](DECISIONS.md) | Decision records. Amend this file before intentionally changing a foundational choice. |

## v1 capabilities

- Developer organizations, projects, environments, redirect URLs, publishable keys, and secret API keys.
- Email/password sign-up and sign-in, verified-email gating, password reset, and explicit sign-out.
- Browser sessions with short-lived access JWTs and opaque, rotating refresh tokens.
- Project-scoped RBAC: roles contain permissions and memberships grant roles to users.
- Email delivery through SQS-backed workers and Amazon SES.
- Redis-backed, tenant-aware rate limiting; PostgreSQL is always the source of truth.
- Immutable application audit events, exportable to S3 on a retention schedule.

## Explicit v1 non-goals

- Social/OIDC login, passkeys, MFA, SCIM, SAML, billing, and a public SDK are deferred.
- AuthForge does not store application business data beyond identity and authorization metadata.
- No tenant-configurable JWT signing algorithms, arbitrary webhooks, or per-tenant database instances.
- No independently deployed domain microservices.

## Starting locally

1. Use the service definitions in the future `compose.yaml` to run PostgreSQL, Redis, LocalStack or a compatible AWS emulator, the API, and the worker.
2. Apply migrations before starting the API. Seed a single developer organization, project, and local key only through a development-only seed command.
3. Use a fixed local issuer, for example `http://localhost:8080`, and a local email sink. Never send email to real addresses from local development.
4. Keep `.env.example` complete but secret-free. Load actual development secrets from an untracked `.env` file or the approved secret manager integration.

Implementation order, environment variables, and verification gates are specified in [ROADMAP.md](ROADMAP.md), [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md), and [TESTING.md](TESTING.md).
