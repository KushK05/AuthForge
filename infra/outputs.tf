output "environment" {
  description = "The deployment stage represented by this root."
  value       = var.environment
}

output "showcase_url" { value = "https://${var.domain_name}" }
output "ecr_repository_url" { value = aws_ecr_repository.app.repository_url }
output "cluster_name" { value = aws_ecs_cluster.main.name }
output "migration_task_definition" { value = aws_ecs_task_definition.migrate.arn }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
output "migration_security_group_id" { value = aws_security_group.api.id }
output "queue_url" { value = aws_sqs_queue.events.url }
output "dlq_url" { value = aws_sqs_queue.events_dlq.url }
output "artifact_bucket" { value = aws_s3_bucket.artifacts.bucket }

output "ses_identity" { value = aws_sesv2_email_identity.sender.email_identity }
output "ses_sender" { value = local.ses_from_email }
output "ses_simulator_recipient" { value = var.ses_simulator_email }
output "aws_region" { value = var.aws_region }
output "resource_prefix" { value = local.name }
output "database_identifier" { value = aws_db_instance.main.identifier }
output "redis_replication_group_id" { value = aws_elasticache_replication_group.main.replication_group_id }
output "kms_key_id" { value = aws_kms_key.main.key_id }
output "console_access_code_secret_arn" { value = aws_secretsmanager_secret.console_access_code.arn }
output "teardown_at" { value = var.teardown_at }
