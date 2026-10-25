import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const infraDirectory = join(import.meta.dirname, "../../infra");
const terraform = readdirSync(infraDirectory)
  .filter((file) => file.endsWith(".tf"))
  .map((file) => readFileSync(join(infraDirectory, file), "utf8"))
  .join("\n");

const block = (type: string, name: string): string => {
  const start = terraform.indexOf(`resource "${type}" "${name}"`);
  expect(start, `${type}.${name} is declared`).toBeGreaterThanOrEqual(0);
  const next = terraform.indexOf("\nresource ", start + 1);
  return terraform.slice(start, next === -1 ? undefined : next);
};

describe("showcase infrastructure", () => {
  it("declares every AWS evaluation service", () => {
    const required = [
      "aws_route53_record", "aws_cloudfront_distribution", "aws_acm_certificate", "aws_lb",
      "aws_wafv2_web_acl", "aws_ecs_service", "aws_ecr_repository", "aws_db_instance",
      "aws_elasticache_replication_group", "aws_sqs_queue", "aws_sesv2_email_identity",
      "aws_s3_bucket", "aws_kms_key", "aws_secretsmanager_secret", "aws_cloudwatch_dashboard",
      "aws_cloudwatch_metric_alarm", "aws_iam_role"
    ];
    for (const type of required) expect(terraform).toContain(`resource "${type}"`);
  });

  it("keeps RDS private, encrypted, and free of retained data", () => {
    const database = block("aws_db_instance", "main");
    expect(database).toContain("publicly_accessible    = false");
    expect(database).toContain("storage_encrypted = true");
    expect(database).toContain("backup_retention_period      = 0");
    expect(database).toContain("skip_final_snapshot          = true");
    expect(database).toContain("deletion_protection          = false");
  });

  it("keeps Redis encrypted with no snapshots", () => {
    const redis = block("aws_elasticache_replication_group", "main");
    expect(redis).toContain("at_rest_encryption_enabled = true");
    expect(redis).toContain("transit_encryption_enabled = true");
    expect(redis).toContain("snapshot_retention_limit = 0");
  });

  it("blocks public S3 access and empties the bucket on destroy", () => {
    expect(block("aws_s3_bucket", "artifacts")).toContain("force_destroy = true");
    const access = block("aws_s3_bucket_public_access_block", "artifacts");
    for (const flag of ["block_public_acls", "block_public_policy", "ignore_public_acls", "restrict_public_buckets"]) {
      expect(access).toMatch(new RegExp(`${flag}\\s+= true`));
    }
  });

  it("deletes secrets immediately and encrypts them with KMS", () => {
    for (const name of ["console_access_code", "credential_hash_key", "database_url"]) {
      const secret = block("aws_secretsmanager_secret", name);
      expect(secret).toContain("recovery_window_in_days = 0");
      expect(secret).toContain("kms_key_id");
    }
  });

  it("encrypts both queues and runs one task per service", () => {
    expect(block("aws_sqs_queue", "events")).toContain("kms_master_key_id");
    expect(block("aws_sqs_queue", "events_dlq")).toContain("kms_master_key_id");
    expect(block("aws_ecs_service", "api")).toContain("desired_count   = var.start_services ? 1 : 0");
    expect(block("aws_ecs_service", "worker")).toContain("desired_count   = var.start_services ? 1 : 0");
  });

  it("keeps tasks private and never exposes secret values as outputs", () => {
    expect(block("aws_ecs_service", "api")).toContain("assign_public_ip = false");
    expect(block("aws_ecs_service", "worker")).toContain("assign_public_ip = false");
    expect(terraform).not.toMatch(/output "[^"]+" \{[^}]*random_password/);
    expect(terraform).not.toMatch(/output "[^"]+" \{[^}]*secret_string/);
  });
  it("restricts simulator mail in IAM, uses DNS sender verification, and records a teardown owner", () => {
    expect(terraform).toContain('variable = "ses:FromAddress"');
    expect(terraform).toContain('variable = "ses:Recipients"');
    expect(terraform).toContain('resource "aws_route53_record" "ses_dkim"');
    expect(terraform).toContain('sslmode=verify-full');
    expect(terraform).toContain('variable "evaluation_owner"');
    expect(terraform).toContain('variable "teardown_at"');
  });
  it("scopes execution-role secret access and KMS decryption to each workload", () => {
    expect(terraform).not.toContain("shared_secrets");
    expect(terraform).toContain("resources = each.value.secret_arns");
    expect(terraform).toContain('"kms:EncryptionContext:SecretARN"');
    expect(terraform).toContain('"kms:ViaService"');
    for (const role of ["api", "worker", "migrate"]) expect(terraform).toContain(`aws_iam_role.execution["${role}"].arn`);
  });
});
