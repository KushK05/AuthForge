variable "aws_region" {
  type        = string
  description = "AWS region for this isolated environment."
}

variable "environment" {
  type        = string
  description = "Deployment stage name."

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "domain_name" {
  type        = string
  description = "Temporary showcase hostname in the existing hosted zone."
}
variable "hosted_zone_id" {
  type        = string
  description = "Existing Route 53 hosted zone; never destroyed by this stack."
}
variable "image_tag" {
  type        = string
  description = "Immutable commit SHA tag pushed to ECR."
  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.image_tag))
    error_message = "Use the full 40-character commit SHA as the immutable image tag."
  }
}
variable "log_retention_days" {
  type    = number
  default = 1
  validation {
    condition     = contains([1, 3, 5, 7], var.log_retention_days)
    error_message = "Use short showcase log retention."
  }
}
variable "ses_dkim_domain" {
  type        = string
  description = "SES DKIM DNS suffix for the selected region, checked against AWS SES endpoint documentation before apply."
  default     = "dkim.amazonses.com"
  validation {
    condition     = can(regex("^dkim(\\.[a-z0-9-]+)?\\.amazonses\\.com$", var.ses_dkim_domain))
    error_message = "Use an AWS SES DKIM domain for the chosen region."
  }
}
variable "ses_simulator_email" {
  type    = string
  default = "success@simulator.amazonses.com"
  validation {
    condition     = contains(["success@simulator.amazonses.com", "bounce@simulator.amazonses.com", "complaint@simulator.amazonses.com", "ooto@simulator.amazonses.com", "suppressionlist@simulator.amazonses.com"], var.ses_simulator_email)
    error_message = "Only SES mailbox simulator recipients are allowed."
  }
}
variable "start_services" {
  type        = bool
  default     = false
  description = "Enable only after pushing the image and successfully running the migration task."
}

variable "evaluation_owner" {
  type        = string
  description = "Synthetic operator label responsible for teardown (no name or email)."
  validation {
    condition     = can(regex("^operator-[a-z0-9-]{1,32}$", var.evaluation_owner))
    error_message = "Use a synthetic operator label such as operator-demo."
  }
}
variable "teardown_at" {
  type        = string
  description = "Explicit UTC teardown deadline in RFC3339 format. This is recorded, not an automatic scheduler."
  validation {
    condition     = can(formatdate("YYYY-MM-DD'T'hh:mm:ss'Z'", var.teardown_at))
    error_message = "Supply a UTC RFC3339 teardown deadline."
  }
}
