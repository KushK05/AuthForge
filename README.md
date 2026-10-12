# AuthForge

AuthForge is a temporary authentication showcase with three product capabilities:

- A small developer console.
- Creation, listing, and revocation of API keys.
- Creation, validation, listing, and revocation of application sessions.

It is not a production identity platform. It has no end-user account system and accepts only synthetic demonstration data.

## Evaluation requirement

The product surface is intentionally small, but the deployment must demonstrate the previously selected AWS services:

- Route 53, CloudFront, ACM, an Application Load Balancer, and AWS WAF.
- Amazon ECS on Fargate for one API task and one worker task.
- Amazon RDS for PostgreSQL and Amazon ElastiCache for Redis.
- Amazon SQS with a dead-letter queue and Amazon SES in sandbox or simulator mode.
- Amazon S3, AWS KMS, AWS Secrets Manager, Amazon CloudWatch, Amazon ECR, and IAM.
- Terraform for repeatable provisioning and complete teardown.

RDS, Redis, S3, queues, logs, and other resources may contain synthetic showcase data only. Nothing is retained after the temporary AWS environment is destroyed. No real user or business data may be entered.

## Current repository status

The documentation defines the new target scope. Some source files, tests, dependencies, Compose services, and Terraform files still reflect the superseded production feature set. Future implementation work must simplify that code while preserving the AWS evaluation surface.

## Explicitly excluded

- Developer organizations, teams, tenant projects, environments, and billing.
- End-user registration, passwords, email verification, password reset, profiles, roles, and permissions.
- Social login, MFA, refresh-token families, public JWT/JWKS infrastructure, and user directories.
- Real recipient email, real personal data, production traffic, long-term retention, backups, and disaster recovery.
- Microservices, multi-region operation, and independent domain deployments.

## Demonstration flow

1. Open the developer console and enter the deployment-scoped console access code.
2. Create an API key and copy its secret from the one-time response.
3. Use the API key to create a session for a synthetic subject such as `demo-user-1`.
4. Validate the returned session token.
5. Revoke the session or API key and show that subsequent validation fails.
6. Show the synthetic lifecycle event moving through SQS to the worker, CloudWatch, S3, and SES sandbox integration.
7. Destroy the Terraform environment and verify that no AuthForge data resource remains.

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

## Local target

Local development may use Docker Compose for PostgreSQL, Redis, and LocalStack equivalents of SQS, SES, S3, KMS, and Secrets Manager. The expected path is:

```bash
npm install
cp .env.example .env
docker compose up -d
npm run migrate
npm run dev:api
npm run dev:worker
```

Do not claim this path works until the implementation, Compose file, environment template, migrations, and the journey in [TESTING.md](docs/TESTING.md) are aligned and verified.
