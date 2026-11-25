import { describe, expect, it } from "vitest";
import { validateClassroomVariables } from "../../scripts/classroom-aws.js";

describe("classroom AWS safeguards", () => {
  const sha = "a".repeat(40);
  const valid = `aws_region = "us-east-1"\nallowed_cidr = "198.51.100.4/32"\nses_from_email = "classroom@school.example"\nauth_email_test_recipient = "learner@school.example"\nteardown_at = "2026-10-26T10:00:00Z"\nsource_sha = "${sha}"`;
  const now = new Date("2026-10-26T04:00:00Z");
  it("accepts committed source, restricted or public IPv4 ingress, and a short deadline", () => {
    expect(() => validateClassroomVariables(valid, sha, now)).not.toThrow();
    expect(() => validateClassroomVariables(valid.replace("198.51.100.4/32", "0.0.0.0/0"), sha, now)).not.toThrow();
  });
  it("rejects stale source, non-IPv4 ingress, examples, missing inboxes, and long deployments", () => {
    expect(() => validateClassroomVariables(valid, "b".repeat(40), now)).toThrow("source_sha");
    expect(() => validateClassroomVariables(valid.replace("198.51.100.4/32", "::/0"), sha, now)).toThrow("IPv4 CIDR");
    expect(() => validateClassroomVariables(valid.replace("classroom@school.example", "verified-demo@example.com"), sha, now)).toThrow("example");
    expect(() => validateClassroomVariables(valid.replace("learner@school.example", "test-inbox@example.com"), sha, now)).toThrow("example");
    expect(() => validateClassroomVariables(valid.replace("auth_email_test_recipient = \"learner@school.example\"\n", ""), sha, now)).toThrow("auth_email_test_recipient");
    expect(() => validateClassroomVariables(valid.replace("10:00:00", "20:00:00"), sha, now)).toThrow("12 hours");
  });
});
