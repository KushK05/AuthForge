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
