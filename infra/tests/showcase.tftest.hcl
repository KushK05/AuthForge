# All providers are mocked. Test applies create fake state only, never AWS resources.
mock_provider "aws" {
  mock_data "aws_caller_identity" { defaults = { account_id = "123456789012" } }
  mock_data "aws_availability_zones" { defaults = { names = ["us-east-1a", "us-east-1b"] } }
  mock_data "aws_route53_zone" { defaults = { zone_id = "Z1234567890", name = "example.com." } }
  mock_data "aws_iam_policy_document" { defaults = { json = "{}" } }
  mock_resource "aws_kms_key" { defaults = { arn = "arn:aws:kms:us-east-1:123456789012:key/00000000-0000-4000-8000-000000000001" } }
  mock_resource "aws_iam_role" { defaults = { arn = "arn:aws:iam::123456789012:role/authforge-mock" } }
  mock_resource "aws_lb" { defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/mock/0123456789abcdef" } }
  mock_resource "aws_lb_target_group" { defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/mock/0123456789abcdef" } }
  mock_resource "aws_lb_listener" { defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/mock/0123456789abcdef/0123456789abcdef" } }
  mock_resource "aws_wafv2_web_acl" { defaults = { arn = "arn:aws:wafv2:us-east-1:123456789012:regional/webacl/mock/00000000-0000-4000-8000-000000000002" } }
  mock_resource "aws_acm_certificate_validation" { defaults = { certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-4000-8000-000000000003" } }
  mock_resource "aws_sqs_queue" { defaults = { arn = "arn:aws:sqs:us-east-1:123456789012:mock" } }
  mock_resource "aws_s3_bucket" { defaults = { arn = "arn:aws:s3:::authforge-mock" } }
  mock_resource "aws_cloudwatch_log_group" { defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/authforge/mock" } }
  mock_resource "aws_sesv2_email_identity" {
    defaults = { dkim_signing_attributes = { tokens = ["tokenone", "tokentwo", "tokenthree"] } }
  }
}
mock_provider "aws" {
  alias = "us_east_1"
  mock_resource "aws_acm_certificate_validation" { defaults = { certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-4000-8000-000000000003" } }
}
mock_provider "random" {}

override_resource {
  target = aws_acm_certificate.origin
  values = { arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-4000-8000-000000000003", domain_validation_options = [{ domain_name = "origin.authforge.example.com", resource_record_name = "_origin.authforge.example.com", resource_record_type = "CNAME", resource_record_value = "origin.acm-validations.aws." }] }
}
override_resource {
  target = aws_acm_certificate.edge
  values = { arn = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-4000-8000-000000000003", domain_validation_options = [{ domain_name = "authforge.example.com", resource_record_name = "_edge.authforge.example.com", resource_record_type = "CNAME", resource_record_value = "edge.acm-validations.aws." }] }
}
variables {
  aws_region       = "us-east-1"
  environment      = "development"
  domain_name      = "authforge.example.com"
  hosted_zone_id   = "Z1234567890"
  image_tag        = "0123456789abcdef0123456789abcdef01234567"
  evaluation_owner = "operator-demo"
  teardown_at      = "2026-11-01T00:00:00Z"
}
run "prepare_without_starting_services" {
  command = apply
  assert {
    condition     = aws_ecs_service.api.desired_count == 0 && aws_ecs_service.worker.desired_count == 0
    error_message = "Services must stay stopped until migrations and SES verification succeed."
  }
  assert {
    condition     = aws_db_instance.main.publicly_accessible == false && aws_db_instance.main.backup_retention_period == 0 && aws_db_instance.main.skip_final_snapshot
    error_message = "RDS must remain private and disposable."
  }
  assert {
    condition     = aws_elasticache_replication_group.main.transit_encryption_enabled && aws_elasticache_replication_group.main.snapshot_retention_limit == 0
    error_message = "Redis requires TLS and no retained snapshots."
  }
  assert {
    condition     = aws_sesv2_email_identity.sender.email_identity == "mail.authforge.example.com" && length(aws_route53_record.ses_dkim) == 3
    error_message = "A synthetic sender domain must use DNS verification."
  }
  assert {
    condition     = aws_s3_bucket.artifacts.force_destroy && aws_secretsmanager_secret.database_url.recovery_window_in_days == 0
    error_message = "Teardown must remove artifacts and secrets."
  }
  assert {
    condition     = aws_ecs_service.api.network_configuration[0].assign_public_ip == false && aws_ecs_service.worker.network_configuration[0].assign_public_ip == false
    error_message = "Fargate tasks must remain private."
  }
  assert {
    condition     = strcontains(aws_secretsmanager_secret_version.database_url.secret_string, "sslmode=verify-full")
    error_message = "RDS connections must verify the server certificate."
  }
}
run "start_one_api_and_one_worker" {
  command = apply
  variables { start_services = true }
  assert {
    condition     = aws_ecs_service.api.desired_count == 1 && aws_ecs_service.worker.desired_count == 1
    error_message = "The showcase runs exactly one API and one worker."
  }
  assert {
    condition     = jsondecode(aws_ecs_task_definition.api.container_definitions)[0].image == jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].image
    error_message = "API and worker must use the same immutable image."
  }
  assert {
    condition     = jsondecode(aws_ecs_task_definition.api.container_definitions)[0].healthCheck.command[1] == "node"
    error_message = "The API task needs a readiness health check."
  }
}
run "reject_real_recipient" {
  command = plan
  variables { ses_simulator_email = "person@example.com" }
  expect_failures = [var.ses_simulator_email]
}
run "reject_mutable_image_tag" {
  command = plan
  variables { image_tag = "latest" }
  expect_failures = [var.image_tag]
}

run "isolate_workload_credentials" {
  command = apply
  assert {
    condition     = sort([for secret in jsondecode(aws_ecs_task_definition.api.container_definitions)[0].secrets : secret.name]) == sort(["CONSOLE_ACCESS_CODE", "CREDENTIAL_HASH_KEY", "DATABASE_URL"])
    error_message = "Only the API may receive authentication secrets."
  }
  assert {
    condition     = [for secret in jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].secrets : secret.name] == ["DATABASE_URL"] && [for secret in jsondecode(aws_ecs_task_definition.migrate.container_definitions)[0].secrets : secret.name] == ["DATABASE_URL"]
    error_message = "Worker and migration tasks must receive only the database secret."
  }
  assert {
    condition     = local.execution_access.worker.secret_arns == [aws_secretsmanager_secret.database_url.arn] && local.execution_access.migrate.secret_arns == [aws_secretsmanager_secret.database_url.arn] && length(local.execution_access.api.secret_arns) == 3
    error_message = "Execution-role secret permissions must match workload needs."
  }
  assert {
    condition     = length(aws_iam_role.execution) == 3 && aws_iam_role.execution["api"].name != aws_iam_role.execution["worker"].name && aws_iam_role.execution["worker"].name != aws_iam_role.execution["migrate"].name
    error_message = "Each workload must have a separate execution role."
  }
  assert {
    condition     = alltrue([for item in jsondecode(aws_ecs_task_definition.worker.container_definitions)[0].environment : !contains(["REDIS_URL", "CONSOLE_ACCESS_CODE", "CREDENTIAL_HASH_KEY", "CONSOLE_ORIGIN"], item.name)])
    error_message = "Worker environment must not carry API authentication configuration."
  }
}
