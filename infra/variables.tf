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
