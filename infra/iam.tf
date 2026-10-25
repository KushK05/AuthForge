data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

# Each workload can inject only its own secrets and write only its own log stream.
locals {
  execution_access = {
    api = {
      log_arn     = aws_cloudwatch_log_group.api.arn
      secret_arns = [aws_secretsmanager_secret.database_url.arn, aws_secretsmanager_secret.console_access_code.arn, aws_secretsmanager_secret.credential_hash_key.arn]
    }
    worker = {
      log_arn     = aws_cloudwatch_log_group.worker.arn
      secret_arns = [aws_secretsmanager_secret.database_url.arn]
    }
    migrate = {
      log_arn     = aws_cloudwatch_log_group.migrate.arn
      secret_arns = [aws_secretsmanager_secret.database_url.arn]
    }
  }
}
resource "aws_iam_role" "execution" {
  for_each           = local.execution_access
  name               = "${local.name}-${each.key}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "execution" {
  for_each = local.execution_access
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
    resources = [aws_ecr_repository.app.arn]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${each.value.log_arn}:*"]
  }
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = each.value.secret_arns
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.main.arn]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:SecretARN"
      values   = each.value.secret_arns
    }
  }
}
resource "aws_iam_role_policy" "execution" {
  for_each = local.execution_access
  name     = "task-start"
  role     = aws_iam_role.execution[each.key].id
  policy   = data.aws_iam_policy_document.execution[each.key].json
}

# API task role: intentionally has no AWS permissions. The API reads its
# secrets through the execution role and never sends mail or writes artifacts.
resource "aws_iam_role" "api" {
  name               = "${local.name}-api"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

# Worker task role: consumes SQS, writes the dedicated artifact prefix, and
# calls SES only for the sandbox sender identity.
resource "aws_iam_role" "worker" {
  name               = "${local.name}-worker"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "worker" {
  statement {
    actions   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.events.arn]
  }

  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/showcase-events/*"]
  }

  statement {
    actions   = ["ses:SendEmail"]
    resources = [aws_sesv2_email_identity.sender.arn]
    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [local.ses_from_email]
    }
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "ses:Recipients"
      values   = [var.ses_simulator_email]
    }
  }

  statement {
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.main.arn]
  }
}

resource "aws_iam_role_policy" "worker" {
  name   = "event-delivery"
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker.json
}
