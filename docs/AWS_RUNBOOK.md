# Future AWS evaluation runbook

This is preparation for a separately approved, billable evaluation. No command below has been run against an AWS account. Do not create resources until an evaluation owner, UTC teardown deadline, account, region, and cost approval exist. Local development needs no AWS account.

## Prepare without cloud resources

1. Run `npm run build`, `npm run lint`, `npm test`, and the local journeys in `TESTING.md`.
2. Initialize and run the formatting, validation, and mocked tests in `infra/classroom` without AWS credentials.
3. Copy `infra/classroom/classroom.tfvars.example` to ignored `infra/classroom/classroom.tfvars`. Set the exact commit SHA, restricted classroom IPv4 `/32`, pre-verified SES sender, synthetic operator, and deadline within 12 hours.
4. Obtain an approved college AWS profile. Never put credentials or state in GitHub.

### Portable classroom command

The active classroom root is `infra/classroom`; the older `infra` root is reference material and must not be applied. The repository includes `npm run classroom:aws -- preflight|plan|deploy|status|smoke|destroy-plan|destroy` for another macOS or Linux machine. Install Node.js, npm, Terraform, AWS CLI v2, Git, and curl, then configure an approved AWS profile. Copy `infra/classroom/classroom.tfvars.example` to ignored `infra/classroom/classroom.tfvars` and fill it locally. Credentials, account variables, state, plan files, and generated secrets never enter GitHub.

`preflight` validates the tools, clean committed source, exact source SHA, restricted classroom IPv4 CIDR, a teardown deadline no more than 12 hours away, selected AWS account, and Terraform configuration. It creates no resources. `plan` verifies the SES sender and displays a saved deployment plan without creating resources. Only after a person reviews that concrete plan does `deploy`, guarded by `AUTHFORGE_ALLOW_BILLABLE_AWS=yes` and `AUTHFORGE_CONFIRM=DEPLOY`, apply it and wait for EC2 health. Run `smoke` for the synthetic journey and `status` to list the five resource identifiers.

Run `destroy-plan` immediately after the demonstration and review the resources it will remove. Then run `destroy` with `AUTHFORGE_CONFIRM=DESTROY`; it applies only that saved plan and requires empty Terraform state. Teardown remains usable if source files changed. Independently verify EC2, RDS, S3, CloudWatch, and project IAM/VPC resources are absent. The same working directory and its local state must remain available through teardown. `teardown_at` is a guard and tag, not an automatic timer.

## Future approved classroom deployment

1. Confirm the college credit balance, selected account/profile, SES sender verification, classroom IPv4 `/32`, and teardown deadline.
2. Run `npm run classroom:aws -- preflight`; it creates no resources.
3. Run `npm run classroom:aws -- plan` and review the exact EC2, public IPv4, RDS, S3, SES, and CloudWatch plan. Only after approval, set `AUTHFORGE_ALLOW_BILLABLE_AWS=yes` and `AUTHFORGE_CONFIRM=DEPLOY`, then run `npm run classroom:aws -- deploy`.
4. Run `npm run classroom:aws -- status` and `npm run classroom:aws -- smoke`. Show all five service resources without displaying secrets or state.
5. Use synthetic data and the SES mailbox simulator only. Never widen ingress.

## Future classroom teardown

1. Stop writes and run `npm run classroom:aws -- destroy-plan` with the same approved profile and account guard.
2. Review the exact teardown plan, set `AUTHFORGE_CONFIRM=DESTROY`, and run `npm run classroom:aws -- destroy` immediately.
3. Verify the EC2 instance/EIP, RDS instance/snapshots, S3 bucket/objects, CloudWatch log group, and project IAM/VPC resources are absent. Empty state alone is insufficient.
4. Delete local state, backups, plans, `.tfvars`, and temporary credentials only after the audit. Retain no application data.

## Verification status

Formatting, validation, and mocked Terraform tests provide local evidence only. Real AWS IAM, quotas, SES simulator delivery, EC2 bootstrap, RDS TLS, CloudWatch delivery, and teardown require the separately approved classroom evaluation. No AWS resources have been created during preparation.
