# Future AWS evaluation runbook

This is preparation for a separately approved, billable evaluation. No command below has been run against an AWS account. Do not create resources until an evaluation owner, UTC teardown deadline, account, region, and cost approval exist. Local development needs no AWS account.

## Prepare without cloud resources

1. Run `npm run build`, `npm run lint`, `npm test`, and the local journeys in `TESTING.md`.
2. Run `bash scripts/infra-check.sh --init` once to download provider plugins. Subsequent `npm run infra:check` uses networking-disabled containers and mocked providers only.
3. Copy `infra/showcase.tfvars.example` to an ignored `infra/showcase.tfvars`. Replace the reserved example hostname with a hostname in an existing owned public Route 53 zone. Do not buy a domain for local preparation.
4. Set a full committed source SHA, synthetic operator label, explicit teardown deadline, and region-appropriate SES DKIM suffix. Leave `start_services=false`.
5. Obtain an approved deployment role/profile for the selected AWS account. Do not use application task roles or real user data for deployment.

## Future approved deployment

1. Review `terraform -chdir=infra plan -var-file=showcase.tfvars` and the expected cost before applying. The stopped-service setting still creates billable infrastructure when applied.
2. After explicit approval, apply the reviewed plan with services stopped. Keep Terraform state secure: it contains generated secrets. Do not commit state or plan files.
3. Build the shared image for `linux/amd64`, tag it with the configured commit SHA, authenticate to the exported ECR repository, and push that exact tag. All image and AWS actions require the approved account/profile.
4. Wait for ACM DNS certificate validation and SES DNS identity verification. SES uses a fixed synthetic sender on `mail.<showcase-hostname>`; only simulator destinations are allowed. Check the SES sending quota and sandbox state. Do not request production email access or verify a real recipient.
5. Run the guarded helper only after approval: set `AWS_PROFILE`, `AUTHFORGE_EXPECTED_ACCOUNT_ID`, and `AUTHFORGE_ALLOW_BILLABLE_AWS=yes`, then run `npm run aws:migrate`. It verifies the account and SES identity before launching one private Fargate migration task and checks its exit status. It does not enable the services.
6. Review another plan with `start_services=true`; apply only after migrations succeed. Wait for one healthy API task and one running worker task.
7. Follow the mandatory journey in `TESTING.md` using the temporary HTTPS URL and synthetic data. Verify forwarded IPs, cookie flags, CSRF, ownership, revocation, all CloudWatch widgets, queue delivery, S3 redaction, simulator SES acceptance, and the controlled failure reaching the DLQ. Record evidence without credential values.
8. Record actual resource identifiers and outputs securely for the teardown audit. Do not retain raw secrets in evidence.

## Future teardown

1. Stop writes and review a destroy plan while state and resource identifiers are available.
2. Destroy the reviewed stack. S3 and ECR are configured for deletion with contents; secrets delete immediately; RDS skips its final snapshot; Redis has no snapshots.
3. Verify there are no remaining project databases or snapshots, cache clusters or snapshots, queues/DLQ, buckets/objects, secrets, ECS tasks/services, ECR repository/images, load balancer, WAF resources, CloudFront distribution, project DNS records/certificates, log groups, or project networking resources. An empty Terraform state alone is not sufficient evidence.
4. Verify the project KMS alias is gone and the key is pending deletion in the approved seven-day path. Never delete the shared hosted zone or any unrelated resource.
5. Remove local secret-bearing state, state backups, plan files, and any temporary credentials after the resource audit. Retain only redacted evaluation evidence allowed by the teardown contract; do not retain application data.

## Verification status

Formatting/validation and mocked Terraform tests provide local evidence only. Real AWS IAM, quotas, certificate handshakes, DNS ownership, simulator delivery, deployment, and actual teardown require the separately approved evaluation. No AWS resources have been created during preparation.
