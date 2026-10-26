output "showcase_url" { value = "http://${aws_eip.app.public_ip}:8080" }
output "instance_id" { value = aws_instance.app.id }
output "database_identifier" { value = aws_db_instance.main.identifier }
output "artifact_bucket" { value = aws_s3_bucket.showcase.bucket }
output "log_group" { value = aws_cloudwatch_log_group.app.name }
output "ses_sender" { value = var.ses_from_email }
output "teardown_at" { value = var.teardown_at }
output "console_access_code" {
  value     = random_password.console.result
  sensitive = true
}
