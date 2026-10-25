# AuthForge agent instructions

AuthForge is a temporary AWS authentication showcase, not a production identity service. Read `README.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACTS.md`, `docs/DATA_MODEL.md`, `docs/SECURITY.md`, and `docs/AWS_DEPLOYMENT.md` before changing behavior.

When documents conflict, resolve them in this order: `docs/SECURITY.md`, `docs/API_CONTRACTS.md`, `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, then the remaining documents. Raise unresolved conflicts instead of guessing.

## Non-negotiable product scope

- Support a hosted demo-user registration and sign-in flow alongside the developer console, API-key lifecycle, and application-session lifecycle.
- Use one deployment-scoped console operator. Do not build developer accounts or organization management.
- Sessions use synthetic subject identifiers or approved demo-user identifiers supplied by the demo client.
- Approved `@authforge.demo` users may register and sign in with Argon2id password hashes held only for the demo lifetime. Do not add public onboarding, email verification, password reset, profiles, roles, permissions, social login, MFA, billing, or long-lived user identity.
- Never use real personal, customer, or business data.

## Non-negotiable AWS classroom architecture

- Build one API and one worker from the same TypeScript and Fastify codebase.
- Run the API, worker, and disposable Redis process on one small EC2 instance.
- Use RDS PostgreSQL for temporary authoritative user, API-key, session, and outbox records.
- Process outbox events directly in classroom mode. Write redacted event artifacts to S3 and exercise SES only with the mailbox simulator.
- Send API and worker logs to CloudWatch. Use IAM, a narrow VPC/security-group boundary, and Terraform as supporting controls.
- Do not deploy ECS, ElastiCache, SQS, ALB, WAF, NAT Gateway, CloudFront, Route 53, KMS, ECR, or Secrets Manager for the classroom showcase.
- Destroy the entire environment after evaluation. Do not retain snapshots, backups, buckets, queues, logs, secrets, or databases.

The five demonstrated services are EC2, RDS, SES, S3, and CloudWatch. Keep each integration minimal and directly visible in the showcase. The older full-stack Terraform remains reference material and must not be applied for the classroom demo.

## Change discipline

1. State which documented product or AWS evaluation contract the change affects.
2. Make the smallest coherent change that completes a console, API-key, session, event, or deployment journey.
3. Update the affected Markdown contract when behavior, schema, interface, architecture, security posture, or deployment changes.
4. Add a dated record to `docs/DECISIONS.md` before changing the AWS service set, adding real user management, retaining data after teardown, or creating another deployable service.
5. Remove legacy feature complexity without removing required AWS evidence.

## Implementation rules

- Generate API keys, browser sessions, and session tokens with cryptographically secure randomness.
- Hash demo-user passwords with Argon2id and store only the hash.
- Store only keyed digests of raw API keys and session tokens. Return each raw secret only when created.
- Never log access codes, authorization headers, cookies, raw API keys, raw session tokens, or secret-bearing request bodies.
- Authenticate console routes with one deployment-scoped access code stored in Secrets Manager.
- Require the CSRF token and trusted `Origin` checks defined in `docs/API_CONTRACTS.md` for console mutations.
- Scope every application session to the API key that created it. Other API keys must not discover or revoke it.
- Validate all untrusted HTTP input and use the stable error shape in `docs/API_CONTRACTS.md`.
- Use short, bounded session lifetimes. Expired and revoked sessions must fail validation.
- Put only identifiers and redacted synthetic metadata in SQS, S3, SES, logs, metrics, and traces.
- Database migrations are forward-only and limited to the minimal tables in `docs/DATA_MODEL.md`.

## Required verification

Run the smallest relevant unit and integration tests while working, then the complete showcase journey in `docs/TESTING.md`. Console, API-key, session, event-worker, schema, logging, or infrastructure changes require the related security, contract, AWS integration, and teardown checks.

## When to stop and ask

Ask before adding real user data, non-simulator email, data retention after teardown, a public production commitment, another deployable service, another database, another queue, or an AWS service outside the documented evaluation set. Surface uncertainty explicitly.
