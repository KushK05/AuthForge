terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.0" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
    archive = { source = "hashicorp/archive", version = "~> 2.5" }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = { Application = "authforge-classroom", ManagedBy = "terraform", EvaluationOwner = var.evaluation_owner, TeardownAt = var.teardown_at } }
}

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" { state = "available" }
data "aws_ssm_parameter" "al2023" { name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64" }

locals {
  name         = "authforge-classroom"
  database_url = "postgres://authforge:${random_password.database.result}@${aws_db_instance.main.address}:5432/authforge?sslmode=verify-full"
  common_env   = <<-ENV
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL=${local.database_url}
AWS_REGION=${var.aws_region}
ENV
}

resource "random_password" "database" {
  length  = 32
  special = false
}
resource "random_password" "console" {
  length  = 32
  special = false
}
resource "random_password" "digest" {
  length  = 48
  special = false
}

resource "aws_vpc" "main" {
  cidr_block           = "10.30.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}
resource "aws_internet_gateway" "main" { vpc_id = aws_vpc.main.id }
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  map_public_ip_on_launch = true
}
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "app" {
  name_prefix = "${local.name}-app-"
  vpc_id      = aws_vpc.main.id
}
resource "aws_vpc_security_group_ingress_rule" "classroom" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = var.allowed_cidr
  ip_protocol       = "tcp"
  from_port         = 8080
  to_port           = 8080
}
resource "aws_vpc_security_group_egress_rule" "app" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
resource "aws_security_group" "database" {
  name_prefix = "${local.name}-db-"
  vpc_id      = aws_vpc.main.id
}
resource "aws_vpc_security_group_ingress_rule" "database" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.public[*].id
}
resource "aws_db_instance" "main" {
  identifier                   = local.name
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = "db.t4g.micro"
  db_name                      = "authforge"
  username                     = "authforge"
  password                     = random_password.database.result
  allocated_storage            = 20
  storage_type                 = "gp3"
  storage_encrypted            = true
  db_subnet_group_name         = aws_db_subnet_group.main.name
  vpc_security_group_ids       = [aws_security_group.database.id]
  publicly_accessible          = false
  multi_az                     = false
  backup_retention_period      = 0
  deletion_protection          = false
  skip_final_snapshot          = true
  performance_insights_enabled = false
  apply_immediately            = true
}

resource "aws_s3_bucket" "showcase" {
  bucket        = "${local.name}-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}
resource "aws_s3_bucket_public_access_block" "showcase" {
  bucket                  = aws_s3_bucket.showcase.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "showcase" {
  bucket = aws_s3_bucket.showcase.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "showcase" {
  bucket = aws_s3_bucket.showcase.id
  rule {
    id     = "expire"
    status = "Enabled"
    filter {}
    expiration { days = 1 }
  }
}

data "archive_file" "source" {
  type        = "zip"
  source_dir  = "${path.module}/../.."
  output_path = "${path.module}/authforge-classroom-${var.source_sha}.zip"
  excludes    = [".git", "node_modules", "infra", "coverage", "test-results", "playwright-report", ".env", ".env.local", ".env.worker", ".env.migrate"]
}
resource "aws_s3_object" "source" {
  bucket      = aws_s3_bucket.showcase.id
  key         = "deployment/${var.source_sha}.zip"
  source      = data.archive_file.source.output_path
  source_hash = data.archive_file.source.output_base64sha256
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/authforge/classroom"
  retention_in_days = 1
}

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}
resource "aws_iam_role" "ec2" {
  name               = local.name
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}
resource "aws_iam_instance_profile" "ec2" {
  name = local.name
  role = aws_iam_role.ec2.name
}
data "aws_iam_policy_document" "app" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.showcase.arn}/*"]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.app.arn}:*"]
  }
  statement {
    actions   = ["ses:SendEmail"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [var.ses_from_email]
    }
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "ses:Recipients"
      values   = [var.ses_simulator_email]
    }
  }
}
resource "aws_iam_role_policy" "app" {
  name   = local.name
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_eip" "app" { domain = "vpc" }
resource "aws_instance" "app" {
  ami                         = data.aws_ssm_parameter.al2023.value
  instance_type               = "t3.micro"
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.app.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    region     = var.aws_region
    bucket     = aws_s3_bucket.showcase.bucket
    source_key = aws_s3_object.source.key
    log_group  = aws_cloudwatch_log_group.app.name
    api_env    = base64encode("${local.common_env}REDIS_URL=redis://127.0.0.1:6379\nHOST=0.0.0.0\nPORT=8080\nCONSOLE_ORIGIN=http://${aws_eip.app.public_ip}:8080\nCONSOLE_ACCESS_CODE=${random_password.console.result}\nCREDENTIAL_HASH_KEY=${random_password.digest.result}\nSECURE_COOKIES=false\nTRUST_PROXY=false\n")
    worker_env = base64encode("${local.common_env}CLASSROOM_DIRECT_EVENTS=true\nSHOWCASE_S3_BUCKET=${aws_s3_bucket.showcase.bucket}\nSHOWCASE_SES_FROM_EMAIL=${var.ses_from_email}\nSHOWCASE_SES_SIMULATOR_EMAIL=${var.ses_simulator_email}\n")
  })
  depends_on = [aws_s3_object.source, aws_iam_role_policy.app]
}
resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}

