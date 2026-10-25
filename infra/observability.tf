resource "aws_cloudwatch_metric_alarm" "dlq_depth" {
  alarm_name          = "${local.name}-dlq-depth"
  alarm_description   = "A synthetic lifecycle event reached the DLQ."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  period              = 60
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = { QueueName = aws_sqs_queue.events_dlq.name }
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-5xx"
  alarm_description   = "API targets returned server errors."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  period              = 60
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = { LoadBalancer = aws_lb.main.arn_suffix }
}

resource "aws_cloudwatch_metric_alarm" "api_unhealthy" {
  alarm_name          = "${local.name}-api-unhealthy"
  alarm_description   = "The API target group has no healthy task."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  statistic           = "Minimum"
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  period              = 60
  evaluation_periods  = 2
  treat_missing_data  = "breaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = local.name

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 12, y = 12, width = 12, height = 6
        properties = {
          title   = "Redacted artifacts and SES simulator acceptance"
          region  = var.aws_region, stat = "Sum", period = 60
          metrics = [["AuthForge/Showcase", "ArtifactWrite"], ["AuthForge/Showcase", "SimulatorEmailSuccess"], ["AuthForge/Showcase", "RedisFailure"]]
        }
      },
      {
        type = "metric", x = 0, y = 18, width = 12, height = 6
        properties = {
          title   = "RDS connections and Redis clients"
          region  = var.aws_region, stat = "Average", period = 60
          metrics = [["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", aws_db_instance.main.identifier], ["AWS/ElastiCache", "CurrConnections", "CacheClusterId", "${local.name}-001", "CacheNodeId", "0001"]]
        }
      },
      {
        type = "metric", x = 12, y = 18, width = 12, height = 6
        properties = {
          title   = "API latency and queue age"
          region  = var.aws_region, stat = "Average", period = 60
          metrics = [["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.main.arn_suffix], ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", aws_sqs_queue.events.name]]
        }
      },
      {
        type = "metric", x = 0, y = 12, width = 12, height = 6
        properties = {
          title   = "Worker processing and publication"
          region  = var.aws_region
          stat    = "Sum"
          period  = 60
          metrics = [["AuthForge/Showcase", "WorkerSuccess"], ["AuthForge/Showcase", "WorkerFailure"], ["AuthForge/Showcase", "PublishFailure"]]
        }
      },
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title  = "Event queue and DLQ"
          region = var.aws_region
          stat   = "Maximum"
          period = 60
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.events.name],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.events_dlq.name]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "ALB requests and errors"
          region = var.aws_region
          stat   = "Sum"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.main.arn_suffix]
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title  = "ECS CPU and memory"
          region = var.aws_region
          stat   = "Average"
          period = 60
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.api.name],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.api.name],
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.worker.name]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title  = "WAF allowed and blocked"
          region = var.aws_region
          stat   = "Sum"
          period = 60
          metrics = [
            ["AWS/WAFV2", "AllowedRequests", "WebACL", aws_wafv2_web_acl.main.name, "Region", var.aws_region, "Rule", "ALL"],
            ["AWS/WAFV2", "BlockedRequests", "WebACL", aws_wafv2_web_acl.main.name, "Region", var.aws_region, "Rule", "ALL"]
          ]
        }
      }
    ]
  })
}

resource "aws_cloudwatch_log_metric_filter" "worker" {
  for_each       = toset(["WorkerSuccess", "WorkerFailure", "PublishFailure", "ArtifactWrite", "SimulatorEmailSuccess"])
  name           = "${local.name}-${each.key}"
  log_group_name = aws_cloudwatch_log_group.worker.name
  pattern        = "{ $.metric = \"${each.key}\" }"
  metric_transformation {
    name          = each.key
    namespace     = "AuthForge/Showcase"
    value         = "1"
    default_value = 0
  }
}

resource "aws_cloudwatch_log_metric_filter" "redis_failure" {
  name           = "${local.name}-redis-failure"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "{ $.metric = \"RedisFailure\" }"
  metric_transformation {
    name          = "RedisFailure"
    namespace     = "AuthForge/Showcase"
    value         = "1"
    default_value = 0
  }
}
resource "aws_cloudwatch_metric_alarm" "worker_failure" {
  alarm_name          = "${local.name}-worker-failure"
  namespace           = "AuthForge/Showcase"
  metric_name         = "WorkerFailure"
  statistic           = "Sum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  period              = 60
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
}
