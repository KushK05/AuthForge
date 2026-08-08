# Roadmap

Each milestone is complete only when its exit criteria and applicable tests pass. Build vertical slices in this order; do not start later capabilities solely because their tables can be created early.

## M0 - foundation

Deliver repository layout, formatter/linter, configuration validation, local Compose stack, migration tool, typed error model, request IDs, structured redacted logging, health endpoints, CI skeleton, and IaC skeleton.

Exit criteria: a new developer can start dependencies, migrate an empty database, run API and worker, and execute one smoke test without AWS access.

## M1 - developer tenancy and keys

Implement developer organizations, projects, environments, publishable keys, scoped secret keys, redirect URL allowlist, and audit append. Enforce project-scoped data access from the first query.

Exit criteria: raw secret key is shown exactly once; a key cannot read or mutate another project; every management mutation creates an audit event.

## M2 - identity and email lifecycle

Implement sign-up, Argon2id password storage, verification tokens, password-reset request/confirm, durable outbox, SQS worker, SES adapter, DLQ, idempotent delivery, and safe generic responses.

Exit criteria: retries cause no duplicate users or emails beyond documented resend behavior; expired or consumed tokens fail safely; all session invalidation rules are tested.

## M3 - sessions and authorization

Implement sign-in, session records, KMS-backed JWT signing and JWKS, opaque refresh rotation/replay handling, sign-out, roles, permissions, memberships, and `GET /me`.

Exit criteria: JWT validation passes independent verifier tests; refresh replay revokes family; disabled users cannot refresh; privilege changes are effective within access-token lifetime or explicit revocation policy.

## M4 - production readiness

Provision development, staging, and production environments through IaC. Add ECS, ECR, RDS, Redis, SQS/DLQ, SES, WAF, KMS, Secrets Manager, CloudWatch dashboards/alarms, backup restore exercise, CI/CD promotion, load test, and security review.

Exit criteria: staging deployment is repeatable from an image digest; a restore drill succeeds; alarms can be triggered in a controlled test; a 10x burst load test meets stated objectives.

## M5 - hosted developer experience

Add a minimal developer console, API documentation/OpenAPI publishing, audit search/export, key rotation UX, and usage visibility. Keep console authentication separate from end-user project authentication.

Exit criteria: a developer can create a project, copy a key once, configure redirect URLs, integrate the documented sign-in flow, inspect an audit event, and revoke a key without operator help.

## Deferred backlog

Prioritize after v1 only with a written use case and threat analysis: OAuth/OIDC providers, MFA, passkeys, organization membership for end users, webhooks, SDKs, SAML/SCIM, billing, custom domains, and regional deployment. Each item may alter token, data, or tenancy assumptions and must be assessed before implementation.
