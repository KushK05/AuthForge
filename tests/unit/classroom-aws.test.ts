import { describe, expect, it } from "vitest";
import { validateClassroomVariables } from "../../scripts/classroom-aws.js";

describe("classroom AWS safeguards", () => {
  const sha = "a".repeat(40);
  const valid = `aws_region = "us-east-1"\nallowed_cidr = "198.51.100.4/32"\nses_from_email = "classroom@school.example"\nteardown_at = "2026-10-26T10:00:00Z"\nsource_sha = "${sha}"`;
  const now = new Date("2026-10-26T04:00:00Z");
  it("accepts committed source, restricted ingress, and a short deadline", () => expect(() => validateClassroomVariables(valid, sha, now)).not.toThrow());
  it("rejects stale source, public ingress, examples, and long deployments", () => {
    expect(() => validateClassroomVariables(valid, "b".repeat(40), now)).toThrow("source_sha");
    expect(() => validateClassroomVariables(valid.replace("198.51.100.4/32", "0.0.0.0/0"), sha, now)).toThrow("Public ingress");
    expect(() => validateClassroomVariables(valid.replace("classroom@school.example", "verified-demo@example.com"), sha, now)).toThrow("example");
    expect(() => validateClassroomVariables(valid.replace("10:00:00", "20:00:00"), sha, now)).toThrow("12 hours");
  });
});
