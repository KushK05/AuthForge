# AWS deployment and scale-as-we-go plan

## Baseline AWS topology

Use infrastructure as code, preferably Terraform or AWS CDK, with reusable modules and one reviewed environment root per stage. Do not create resources manually except a documented emergency operation that is immediately reconciled into IaC.

```text
Internet -> Route 53 -> CloudFront (optional later) -> ALB + AWS WAF
                                                    -> ECS Fargate API
Private subnets: ECS Fargate worker, RDS PostgreSQL Multi-AZ, ElastiCache Redis
API/worker -> SQS + DLQ -> SES
API/worker -> Secrets Manager, KMS, CloudWatch, S3 audit archive
CI/CD -> ECR -> ECS deployment
```

Initial production deploys API and worker to ECS Fargate across at least two Availability Zones. RDS PostgreSQL uses Multi-AZ when production availability targets begin. Redis uses a managed ElastiCache deployment with TLS in production. An Application Load Balancer terminates TLS with ACM certificates. AWS WAF attaches to the ALB with managed common, known-bad-input, and rate-based rules. All service access uses IAM task roles.

## Environment stages

| Stage | Purpose | Required posture |
| --- | --- | --- |
| Local | Fast feedback | Compose services, local email sink, no real AWS credentials or recipient email. |
| Development | Shared integration | Small managed resources, isolated data, no production PII, automatic deploy from main after checks. |
| Staging | Release verification | Production-like topology and migrations, seeded synthetic load, manual production promotion gate. |
| Production | User-facing | Isolated account or strongly isolated environment, encrypted backups, alarms, least privilege, rollback-ready release. |

## Infrastructure modules

Create modules for networking, IAM, ECR, ECS service, RDS, Redis, queue/DLQ, email identity/configuration, KMS, secrets, observability, S3 archive, WAF/ALB, and CI federation. Inputs are typed and explicitly named. Outputs are non-secret identifiers and endpoints. Apply least privilege per component: API does not receive SES-send permission if the worker is the sole sender; worker does not receive public ingress; archival job does not receive RDS mutation rights.

## CI/CD flow

1. Pull requests run formatting, static analysis, unit tests, integration tests, contract tests, migration validation, dependency and secret scans, and IaC validation/plan.
2. Merges build an immutable container image tagged with commit SHA, create a software bill of materials, scan it, and push it to ECR.
3. Development deploys the exact image through IaC-aware pipeline steps. Staging promotion runs migrations, deploys API then worker, executes smoke and end-to-end tests, and monitors alarms.
4. Production promotion uses the same image digest, an approved change, and rolling or blue/green deployment. Roll back application image when safe; use expand-migrate-contract for schema changes so rollback remains possible.

Never apply a destructive infrastructure change automatically. IaC plans that replace databases, queues, encryption keys, or network foundations require human review.

## Operations and alarms

CloudWatch dashboards show ALB request/error/latency, API saturation, ECS restarts, RDS CPU/connections/storage/replica lag, Redis memory/evictions, SQS visible messages/age, DLQ depth, SES rejections, authentication outcome rates, and refresh replay rate. Alarm immediately for 5xx surge, DLQ messages, queue age above five minutes, RDS storage danger, repeated deployment failures, unusual API-key failures, and refresh-token replay spikes. Route production alarms to an owned notification channel with runbooks.

Back up RDS automatically with point-in-time recovery. Periodically restore into an isolated environment and validate an authentication smoke journey. Version and encrypt S3 audit exports; lifecycle them to lower-cost storage after the retention window. Do not rely on logs as a backup strategy.

## Scaling roadmap

### Phase 0 - local and development

One API, one worker, local PostgreSQL and Redis. Validate all required flows. Use a managed development database before multiple developers share data. Do not introduce Kubernetes, service mesh, or sharded databases.

### Phase 1 - initial production

ECS Fargate API with minimum two tasks across AZs, one or more worker tasks autoscaled on SQS depth, RDS PostgreSQL, managed Redis, SQS/DLQ, SES, WAF, CloudWatch, KMS, Secrets Manager, ECR, and IaC. Size conservatively from observed load and perform a restore test before launch.

### Phase 2 - measured growth

Trigger when p95 latency, RDS utilization, queue age, or availability objectives are breached for sustained periods. First tune indexes and queries, add connection pooling, add ECS autoscaling, separate read-only audit/export workload, scale workers by queue depth, and deploy RDS read replicas only for verified read pressure. Use Redis only for cache/rate limits, never as durable session source.

### Phase 3 - regional resilience

Trigger when contractual availability, recovery, or geographic latency requires it. Add tested cross-region backup/restore or read-replica strategy, DNS failover plan, regional deployment runbooks, and an explicit consistency decision. Do not claim active-active authentication until token keys, session revocation, tenant routing, and data conflict behavior have been designed and exercised.

### Phase 4 - selective extraction

Only after satisfying `ARCHITECTURE.md` extraction criteria, split the notification worker or audit archival pipeline. Maintain event versioning, replay tooling, dashboards, and ownership. Keep identity/session state close to its transaction boundary unless a substantially stronger case exists.

## Deployment checklist

Before each production release: approved IaC plan, migrated staging database, passing full test suite, confirmed alert routing, zero unexpected DLQ depth, image digest recorded, secrets available by ARN, backup health confirmed, rollback path documented, and no unresolved security finding at release severity.
