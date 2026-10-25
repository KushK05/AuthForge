resource "aws_sqs_queue" "events_dlq" {
  name                      = "${local.name}-events-dlq"
  kms_master_key_id         = aws_kms_key.main.arn
  message_retention_seconds = 86400
}

resource "aws_sqs_queue" "events" {
  name                       = "${local.name}-events"
  kms_master_key_id          = aws_kms_key.main.arn
  message_retention_seconds  = 86400
  visibility_timeout_seconds = 60
  receive_wait_time_seconds  = 10

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.events_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = "${local.name}-artifacts-${local.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-artifacts"
    status = "Enabled"

    filter {}

    expiration {
      days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "artifacts_tls" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket     = aws_s3_bucket.artifacts.id
  policy     = data.aws_iam_policy_document.artifacts_tls.json
  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

# Sandbox sender identity. SES must stay in sandbox or simulator mode.
resource "aws_sesv2_email_identity" "sender" {
  email_identity = local.ses_domain
  dkim_signing_attributes { next_signing_key_length = "RSA_2048_BIT" }
}

# Domain verification uses DNS only; no verification message is sent to an inbox.
resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${aws_sesv2_email_identity.sender.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${local.ses_domain}"
  type    = "CNAME"
  ttl     = 60
  records = ["${aws_sesv2_email_identity.sender.dkim_signing_attributes[0].tokens[count.index]}.${var.ses_dkim_domain}"]
}
