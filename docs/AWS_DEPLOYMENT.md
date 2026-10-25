# Temporary AWS deployment

## Deployment goal

Provision the complete AWS evaluation stack, demonstrate it with synthetic data, and destroy it after the showcase. This is one temporary environment, not a development, staging, and production platform.

## Required topology

```text
Route 53 -> CloudFront + ACM -> ALB + WAF -> ECS Fargate API
                                                |
                                  RDS PostgreSQL + ElastiCache Redis
                                                |
                                           outbox rows
                                                v
                                         SQS queue + DLQ
                                                |
                                       ECS Fargate worker
                                          /          \
                                  SES sandbox        S3

ECR stores the image. KMS, Secrets Manager, CloudWatch, IAM, and Terraform
support and secure the environment.
```

## AWS service evidence

| Service | Minimal showcase purpose |
| --- | --- |
| Route 53 | Temporary DNS record for the showcase hostname. |
| CloudFront | HTTPS edge with cache disabled for `/v1/*` and only static-console assets eligible for short caching. |
| ACM | TLS certificate for the showcase hostname. |
| ALB | Routes health and application traffic to the API task. |
| AWS WAF | Managed common and known-bad-input protections plus a small rate rule. |
| ECS Fargate | One API task and one worker task from the same image. |
| ECR | Stores the immutable showcase image. |
| RDS PostgreSQL | Temporary authoritative console, key, session, outbox, and inbox records. |
| ElastiCache Redis | Login limits and short-lived credential cache or revocation hints. |
| SQS and DLQ | Synthetic lifecycle-event delivery, retry, and visible failure handling. |
| SES | Sandbox or mailbox-simulator call with fixed synthetic content. |
| S3 | Redacted synthetic event artifacts with short lifecycle policy. |
| KMS | Encryption for supported data services, secrets, queues, buckets, and logs. |
| Secrets Manager | Console access code, credential digest key, and database credentials. |
| CloudWatch | Logs, metrics, dashboard, and alarms for the demonstration. |
| IAM | Separate least-privilege API, worker, deployment, and CI roles. |
| Terraform | Creates, documents, and destroys the complete stack. |

Do not substitute, omit, or add services without an approved scope decision.

## Cost and retention posture

- Use one smallest practical API task and one smallest practical worker task.
- Use single-AZ, smallest practical RDS and Redis configurations accepted by the evaluation.
- Disable RDS deletion protection, automated backups, and final snapshots.
- Keep CloudWatch and S3 retention at the shortest evaluation-compatible duration.
- Keep SES in sandbox. Never use a real recipient.
- Do not create standby capacity, read replicas, autoscaling above one task, NAT capacity beyond the minimum design, or multi-region resources.
- Set an explicit teardown time and owner before apply.

## Network and access

CloudFront is the public entry point. The ALB accepts traffic only from the intended edge path where practical. API and worker tasks, RDS, and Redis run in private subnets. RDS and Redis have no public endpoint access.

Use VPC endpoints when they reduce required public egress for ECR, S3, SQS, Secrets Manager, KMS, and CloudWatch. If the minimal environment uses a NAT gateway, document its cost and delete it during teardown.

## Deployment flow

1. Run formatting, type checks, tests, Terraform validation, and a reviewed plan.
2. Build one immutable image and push it to ECR with the commit SHA tag.
3. Apply Terraform for the single showcase environment.
4. Run forward-only migrations against the empty temporary RDS database.
5. Start one API task and one worker task.
6. Verify Route 53, CloudFront, ACM, ALB, WAF, health checks, private data services, and task roles.
7. Run the remote journey in `TESTING.md` using only synthetic data.
8. Rehearse the exact demonstration and controlled DLQ failure.
9. Present the showcase.
10. Run teardown verification, then destroy the stack.

## Required configuration

Application settings include `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`, `CONSOLE_ORIGIN`, `DEFAULT_SESSION_TTL_SECONDS`, `MAX_SESSION_TTL_SECONDS`, `MAX_SUBJECT_LENGTH`, `MAX_REQUEST_BODY_BYTES`, `MAX_API_KEYS`, `MAX_SESSIONS`, `MAX_CONSOLE_SESSIONS`, `MAX_FAILED_CONSOLE_ATTEMPTS`, and `CONSOLE_ATTEMPT_WINDOW_SECONDS`.

AWS resource identifiers and secret ARNs come from Terraform outputs or ECS task configuration. Secret values remain in Secrets Manager and are never Terraform outputs.

## Teardown flow

1. Stop writes and run the final synthetic-data check.
2. Empty the dedicated S3 bucket through the reviewed Terraform teardown mechanism.
3. Run `terraform plan -destroy` and review every target.
4. Run `terraform destroy`.
5. Verify the resources listed in `TESTING.md` are absent and no final RDS snapshot exists.
6. Remove the AuthForge ECR image, temporary Route 53 record, and KMS alias or project key through their documented deletion processes. Never delete a shared hosted zone.
7. Record that no real data was used and no AuthForge application data was retained.

Manual console-created resources are prohibited because they are easy to miss during teardown.

## Prepared deployment controls

Local preparation does not run `terraform apply` and incurs no AWS service charges. Applying this stack creates billable resources and requires a separately approved evaluation window and teardown owner.

`start_services` defaults to false. Provision infrastructure, push the immutable image, run the exported one-shot migration task in the exported private subnets/security group, verify its success, then enable the API and worker services. The migration task is a run-once task from the same image, not another deployable service.

The runtime uses opaque tokens, so no asymmetric JWT signing key or signing permission is required. KMS remains required for storage, queues, logs, ECR, and Secrets Manager encryption. The worker's S3 permission matches `showcase-events/*`.

The standard SES API is used for free LocalStack compatibility. Before any real AWS evaluation, verify the generated `mail.<showcase-hostname>` sender domain through its three Terraform-managed DKIM CNAMEs; the local emulator's sender verification is not evidence that AWS SES has verified an identity. Keep only simulator recipients and do not purchase a domain or request production SES access as part of local preparation.

Worker log metric filters create `AuthForge/Showcase` success, failure, and publication-failure metrics. AWS-only observability and teardown must still be checked during the separately approved evaluation.

## AWS preparation added for future evaluation

The image includes the public [AWS RDS trust bundle](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html). ECS uses `sslmode=verify-full`, verified Redis TLS, and direct Node process commands for signal handling. Deployed configuration rejects local emulator endpoints and refuses to start a worker without queue, encrypted artifact, and SES simulator settings.

SES verifies the dedicated infrastructure domain `mail.<showcase-hostname>` using DNS. The fixed sender is `showcase@mail.<showcase-hostname>`; it is not a demo-user identity or real mailbox. No verification email is sent. [AWS requires sender verification even for simulator delivery](https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html). Demo-user emails remain restricted to `@authforge.demo`. Worker IAM additionally restricts both sender and simulator destination. Select `ses_dkim_domain` using the [regional SES DKIM table](https://docs.aws.amazon.com/general/latest/gr/ses.html).

Use `npm run infra:check` for formatting, validation, and five mocked Terraform test scenarios. After the initial plugin download (`bash scripts/infra-check.sh --init`), checks run in a container with networking disabled and no mounted AWS credentials. Mocked test applies create fake state only; they do not provision AWS resources. They test topology and variable logic, not actual AWS permissions, quotas, TLS handshakes, or SES verification.

See [AWS_RUNBOOK.md](AWS_RUNBOOK.md) for the future deployment, migration, smoke, and teardown sequence. All real AWS actions remain separate, require cost approval, and have not been executed.

## Task-specific configuration

| Workload | Injected secrets | Other required runtime settings |
| --- | --- | --- |
| API | Database URL, console access code, credential digest key | Redis TLS URL, trusted HTTPS Origin, secure cookies |
| Worker | Database URL only | Queue URL, S3 bucket/KMS key, SES sender and simulator recipient |
| Migration task | Database URL only | Runtime environment and log level |

The three task definitions use separate execution roles. Each execution policy permits only its own log group and secret ARNs; KMS decrypt is constrained to Secrets Manager with matching secret encryption context. Existing API/worker application roles remain separate. This changes permissions within the documented IAM service set and adds no deployable service.

Host-side manual worker startup reads `.env.worker`; manual migrations read `.env.migrate` (or explicit process environment). These files are optional and ignored by Git. Compose supplies the required local values automatically. Do not copy API credentials into either workload file.

`TRUST_PROXY=true` means exactly two proxy hops, CloudFront then ALB, rather than trusting all forwarded headers. Keep ALB `X-Forwarded-For` append mode and the protected origin route. Do not expose a shorter route to the API. The future AWS smoke test must confirm that changing a viewer-supplied forwarded prefix does not reset either login limit.
