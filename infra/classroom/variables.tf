variable "aws_region" { type = string }
variable "allowed_cidr" {
  type        = string
  description = "Teacher/demo public IPv4 CIDR, normally x.x.x.x/32."
  validation {
    condition     = can(cidrhost(var.allowed_cidr, 0)) && !contains(["0.0.0.0/0", "::/0"], var.allowed_cidr)
    error_message = "Use a restricted classroom CIDR, never the whole internet."
  }
}
variable "ses_from_email" { type = string }
variable "ses_simulator_email" {
  type    = string
  default = "success@simulator.amazonses.com"
  validation {
    condition     = contains(["success@simulator.amazonses.com", "bounce@simulator.amazonses.com", "complaint@simulator.amazonses.com"], var.ses_simulator_email)
    error_message = "Use only an SES mailbox simulator recipient."
  }
}
variable "evaluation_owner" {
  type = string
  validation {
    condition     = can(regex("^operator-[a-z0-9-]{1,32}$", var.evaluation_owner))
    error_message = "Use a synthetic operator label."
  }
}
variable "teardown_at" {
  type = string
  validation {
    condition     = can(formatdate("YYYY-MM-DD'T'hh:mm:ss'Z'", var.teardown_at))
    error_message = "Use an RFC3339 UTC teardown deadline."
  }
}
variable "source_sha" {
  type = string
  validation {
    condition     = can(regex("^[0-9a-f]{40}$", var.source_sha))
    error_message = "Use the exact full Git commit SHA."
  }
}
