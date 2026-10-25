resource "aws_cloudwatch_log_group" "api" {
  name              = "/authforge/api"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/authforge/worker"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
}

resource "aws_cloudwatch_log_group" "migrate" {
  name              = "/authforge/migrate"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
}

resource "aws_ecs_cluster" "main" {
  name = local.name
}

locals {
  redis_url = "rediss://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"

  runtime_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "AWS_REGION", value = var.aws_region }
  ]

  api_environment = concat(local.runtime_environment, [
    { name = "REDIS_URL", value = local.redis_url },
    { name = "CONSOLE_ORIGIN", value = "https://${var.domain_name}" },
    { name = "SECURE_COOKIES", value = "true" },
    { name = "TRUST_PROXY", value = "true" }
  ])

  worker_environment = [
    { name = "SHOWCASE_QUEUE_URL", value = aws_sqs_queue.events.url },
    { name = "SHOWCASE_S3_BUCKET", value = aws_s3_bucket.artifacts.bucket },
    { name = "SHOWCASE_S3_KMS_KEY_ID", value = aws_kms_key.main.arn },
    { name = "SHOWCASE_SES_FROM_EMAIL", value = local.ses_from_email },
    { name = "SHOWCASE_SES_SIMULATOR_EMAIL", value = var.ses_simulator_email }
  ]

  database_secrets = [
    { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn }
  ]

  api_secrets = concat(local.database_secrets, [
    { name = "CONSOLE_ACCESS_CODE", valueFrom = aws_secretsmanager_secret.console_access_code.arn },
    { name = "CREDENTIAL_HASH_KEY", valueFrom = aws_secretsmanager_secret.credential_hash_key.arn }
  ])
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution["api"].arn
  task_role_arn            = aws_iam_role.api.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name        = "api"
    image       = local.image
    essential   = true
    command     = ["node", "--import", "tsx", "src/api/server.ts"]
    stopTimeout = 30
    healthCheck = {
      command     = ["CMD", "node", "-e", "fetch('http://127.0.0.1:8080/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
    portMappings = [{ containerPort = 8080, protocol = "tcp" }]
    environment = concat(local.api_environment, [
      { name = "HOST", value = "0.0.0.0" },
      { name = "PORT", value = "8080" }
    ])
    secrets = local.api_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "api"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution["worker"].arn
  task_role_arn            = aws_iam_role.worker.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    stopTimeout = 60
    name        = "worker"
    image       = local.image
    essential   = true
    command     = ["node", "--import", "tsx", "src/worker/main.ts"]
    environment = concat(local.runtime_environment, local.worker_environment)
    secrets     = local.database_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.worker.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "worker"
      }
    }
  }])
}

# Run-once task for forward-only migrations. It has no service and no task role.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution["migrate"].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name        = "migrate"
    image       = local.image
    essential   = true
    command     = ["node", "--import", "tsx", "src/platform/database/migrate.ts"]
    environment = local.runtime_environment
    secrets     = local.database_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.migrate.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "migrate"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.start_services ? 1 : 0
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8080
  }

  health_check_grace_period_seconds = 60
  depends_on                        = [aws_lb_listener_rule.api, aws_iam_role_policy.execution["api"]]
}

resource "aws_ecs_service" "worker" {
  depends_on      = [aws_iam_role_policy.worker, aws_iam_role_policy.execution["worker"], aws_route53_record.ses_dkim]
  name            = "worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.start_services ? 1 : 0
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.worker.id]
    assign_public_ip = false
  }
}
