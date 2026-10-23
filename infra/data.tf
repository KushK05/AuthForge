resource "aws_ecr_repository" "app" {
  name                 = local.name
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
  }
}

resource "random_password" "console_access_code" {
  length  = 32
  special = false
}

resource "random_password" "credential_hash_key" {
  length  = 48
  special = false
}

resource "random_password" "database" {
  length  = 32
  special = false
}

resource "random_password" "origin_verify" {
  length  = 40
  special = false
}

# Secret values live in Terraform state only for the lifetime of the temporary
# environment. They are never exposed as outputs.
resource "aws_secretsmanager_secret" "console_access_code" {
  name                    = "${local.name}/console-access-code"
  kms_key_id              = aws_kms_key.main.arn
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "console_access_code" {
  secret_id     = aws_secretsmanager_secret.console_access_code.id
  secret_string = random_password.console_access_code.result
}

resource "aws_secretsmanager_secret" "credential_hash_key" {
  name                    = "${local.name}/credential-hash-key"
  kms_key_id              = aws_kms_key.main.arn
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "credential_hash_key" {
  secret_id     = aws_secretsmanager_secret.credential_hash_key.id
  secret_string = random_password.credential_hash_key.result
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name}/database-url"
  kms_key_id              = aws_kms_key.main.arn
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgres://authforge:${random_password.database.result}@${aws_db_instance.main.address}:5432/authforge?sslmode=require"
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t4g.micro"

  db_name  = "authforge"
  username = "authforge"
  password = random_password.database.result

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = aws_kms_key.main.arn

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period      = 0
  deletion_protection          = false
  skip_final_snapshot          = true
  copy_tags_to_snapshot        = false
  performance_insights_enabled = false
  apply_immediately            = true
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = local.name
  description          = "AuthForge showcase rate limits and validation cache"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = "cache.t4g.micro"

  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.main.arn
  transit_encryption_enabled = true

  snapshot_retention_limit = 0
  apply_immediately        = true
}
