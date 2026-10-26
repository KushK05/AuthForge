# Providers are mocked; this test never contacts AWS or creates resources.
mock_provider "aws" {
  mock_data "aws_caller_identity" { defaults = { account_id = "123456789012" } }
  mock_data "aws_availability_zones" { defaults = { names = ["us-east-1a", "us-east-1b"] } }
  mock_data "aws_ssm_parameter" { defaults = { value = "ami-0123456789abcdef0" } }
  mock_data "aws_iam_policy_document" { defaults = { json = "{}" } }
  mock_resource "aws_s3_bucket" { defaults = { arn = "arn:aws:s3:::authforge-classroom-123456789012" } }
  mock_resource "aws_cloudwatch_log_group" { defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/authforge/classroom" } }
}
mock_provider "random" {}

variables {
  aws_region       = "us-east-1"
  allowed_cidr     = "198.51.100.4/32"
  ses_from_email   = "classroom@school.example"
  evaluation_owner = "operator-class-demo"
  teardown_at      = "2026-10-27T06:00:00Z"
  source_sha       = "0123456789abcdef0123456789abcdef01234567"
}

run "minimal_disposable_classroom_stack" {
  command = apply

  assert {
    condition     = aws_instance.app.instance_type == "t3.micro" && aws_db_instance.main.instance_class == "db.t4g.micro"
    error_message = "Use exactly one small EC2 instance and one small RDS instance."
  }
  assert {
    condition     = aws_vpc_security_group_ingress_rule.classroom.cidr_ipv4 == "198.51.100.4/32"
    error_message = "HTTP ingress must be restricted to the classroom address."
  }
  assert {
    condition     = !aws_db_instance.main.publicly_accessible && aws_db_instance.main.backup_retention_period == 0 && aws_db_instance.main.skip_final_snapshot
    error_message = "RDS must be private and leave no backup or final snapshot."
  }
  assert {
    condition     = aws_s3_bucket.showcase.force_destroy && aws_cloudwatch_log_group.app.retention_in_days == 1
    error_message = "S3 and CloudWatch evidence must be short-lived and destroyable."
  }
  assert {
    condition     = strcontains(data.aws_iam_policy_document.app.json, "ses:SendEmail") || data.aws_iam_policy_document.app.json == "{}"
    error_message = "The instance role must demonstrate SES sending."
  }
}
