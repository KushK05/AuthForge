import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { migrationRequest } from "../../scripts/aws-migrate.js";

describe("future AWS migration request", () => {
  const outputs = {cluster_name: {value: "authforge-demo"}, migration_task_definition: {value: "migration-task"}, private_subnet_ids: {value: ["subnet-one", "subnet-two"]}, migration_security_group_id: {value: "sg-migration"}};
  it("uses one private run-once Fargate task without passing secret values", () => {
    const request = migrationRequest(outputs);
    expect(request).toMatchObject({launchType: "FARGATE", count: 1, networkConfiguration: {awsvpcConfiguration: {assignPublicIp: "DISABLED", subnets: ["subnet-one", "subnet-two"]}}});
    expect(request).not.toHaveProperty("overrides");
    expect(request.clientToken).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("rejects missing deployment outputs", () => {
    expect(() => migrationRequest({})).toThrow();
    expect(() => migrationRequest({...outputs, cluster_name: {value: ""}})).toThrow();
  });
  it("exits before invoking AWS or Terraform unless explicitly enabled", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/aws-migrate.ts"], {
      encoding: "utf8",
      env: { PATH: "", NODE_ENV: "test" }
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("AWS migration is disabled");
    expect(result.stdout).toBe("");
  });
});
