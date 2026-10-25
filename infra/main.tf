terraform {
  required_version = ">= 1.8.0"

  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Application     = "authforge"
      Environment     = var.environment
      ManagedBy       = "terraform"
      EvaluationOwner = var.evaluation_owner
      TeardownAt      = var.teardown_at
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = { Application = "authforge", Environment = var.environment, ManagedBy = "terraform" }
  }
}

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  name           = "authforge-${var.environment}"
  account_id     = data.aws_caller_identity.current.account_id
  origin_host    = "origin.${var.domain_name}"
  azs            = slice(data.aws_availability_zones.available.names, 0, 2)
  ses_domain     = "mail.${var.domain_name}"
  ses_from_email = "showcase@${local.ses_domain}"
  image          = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
}
