# AuthForge

AuthForge is a temporary AWS authentication showcase with four product capabilities:

- A small developer console.
- Creation, listing, and revocation of API keys.
- Creation, validation, listing, and revocation of application sessions.
- Hosted registration and sign-in for approved demonstration users.

It is not a public production service. It accepts only approved `@authforge.demo` identities and synthetic demonstration data, and all data is deleted after the evaluation.

## Classroom evaluation requirement

The active low-cost deployment demonstrates five AWS services:

- Amazon EC2 runs the API, worker, and disposable Redis container.
- Amazon RDS for PostgreSQL stores temporary synthetic state.
- Amazon SES uses only the mailbox simulator.
- Amazon S3 stores redacted synthetic artifacts.
- Amazon CloudWatch receives API and worker logs.

IAM, VPC controls, and Terraform support repeatable deployment and complete teardown. The older large evaluation root remains reference material and is not deployed for the classroom showcase.

RDS, Redis, S3, queues, logs, and other resources may contain synthetic showcase data only. Nothing is retained after the temporary AWS environment is destroyed. No real user or business data may be entered.

## Current repository status

The local backend implements hosted demo registration/sign-in, console access, API keys, opaque application sessions, and the SQS/worker/S3/SES simulator journey. Local contract, integration, and browser checks are described in `docs/TESTING.md`. AWS deployment configuration, a guarded migration helper, and an offline Terraform test suite are prepared; no AWS environment is deployed as part of local setup.

## Explicitly excluded

- Developer organizations, teams, tenant projects, environments, and billing.
- Public onboarding, real-recipient email, password reset, profiles, roles, permissions, and billing.
- Social login, MFA, refresh-token families, public JWT/JWKS infrastructure, and user directories.
- Real recipient email, real personal data, production traffic, long-term retention, backups, and disaster recovery.
- Microservices, multi-region operation, and independent domain deployments.

## Demonstration flow

1. Open the developer console and enter the deployment-scoped console access code.
2. Create an API key and copy its secret from the one-time response.
3. Register and sign in an approved `@authforge.demo` user on the hosted identity page.
4. Use the API key to create a session for that demo user.
5. Validate the returned session token.
6. Revoke the session or API key and show that subsequent validation fails.
7. Show the synthetic lifecycle event moving through SQS to the worker, CloudWatch, S3, and SES sandbox integration.
8. Destroy the Terraform environment and verify that no AuthForge data resource remains.

## Documentation map

| File | Authority |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Mandatory scope and working rules for agents and contributors. |
| [SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) | Product actors, flows, invariants, and AWS interactions. |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | API, worker, module, storage, and event boundaries. |
| [API_CONTRACTS.md](docs/API_CONTRACTS.md) | Console, API-key, and session HTTP contracts. |
| [DATA_MODEL.md](docs/DATA_MODEL.md) | Minimal PostgreSQL model and temporary retention rules. |
| [SECURITY.md](docs/SECURITY.md) | Synthetic-data restrictions and AWS safeguards. |
| [AWS_DEPLOYMENT.md](docs/AWS_DEPLOYMENT.md) | Required AWS topology, smoke test, and teardown path. |
| [ROADMAP.md](docs/ROADMAP.md) | Narrow implementation sequence and exit criteria. |
| [TESTING.md](docs/TESTING.md) | Unit, integration, contract, end-to-end, and teardown checks. |
| [DECISIONS.md](docs/DECISIONS.md) | Architecture decision history and active scope decision. |

## Run the local demo (no AWS account required)

Install Docker Desktop and use Node.js 22.15+ or 24. The Compose environment uses free local PostgreSQL, Redis, and LocalStack Community services. It does not create AWS resources or send real email.

```bash
npm ci
docker compose up --build -d --wait
```

Open http://127.0.0.1:8080 for demo signup/sign-in and http://127.0.0.1:8080/console for developer access. Without a `.env` file, the local console access code is `local-showcase-console-access-code`.

Use only synthetic addresses such as `learner@authforge.demo` and a demo password of at least 12 characters. Create an API key in the console; keep it on the demo application backend. The console previews do not configure MFA, verification, redirects, or webhooks.

Compose creates emulator resources, runs forward-only migrations, then starts the API and worker. Optional API `.env` overrides must keep `CONSOLE_ORIGIN` exactly equal to the address used in the browser. The worker and migration runner use separate optional `.env.worker` and `.env.migrate` files and need no console access code or digest key. Never reuse local example credentials for AWS.

Run the complete local API and event check (prints no credentials):

```bash
npm run demo:check
```

Stop and delete all local demo records:

```bash
docker compose down --volumes
```

For automated verification, follow [TESTING.md](docs/TESTING.md). Real AWS deployment requires a separate explicit approval and will incur AWS charges; no `terraform apply` is needed for the local demo.

## Future AWS evaluation

Run `npm run infra:check` to validate the prepared infrastructure locally. The first run needs provider initialization: `bash scripts/infra-check.sh --init`. These checks do not deploy anything. The [AWS runbook](docs/AWS_RUNBOOK.md) explains the separately approved future migration, deployment, simulator verification, and teardown steps. Real AWS operation remains unverified until that evaluation.

For the approved low-cost teacher showcase, use the separate five-service classroom workflow in [AWS_RUNBOOK.md](docs/AWS_RUNBOOK.md). It deploys only EC2, RDS, SES, S3, and CloudWatch through `infra/classroom`; credentials, account variables, state, and billable confirmation stay outside GitHub. The older full-stack root is reference material and must not be applied for this demo.
