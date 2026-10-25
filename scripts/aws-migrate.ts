import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

type Outputs = Record<string, {value: unknown}>;
export function migrationRequest(outputs: Outputs) {
  const value = (name: string): string => {
    const result = outputs[name]?.value;
    if (typeof result !== "string" || !result) throw new Error(`Missing deployment output: ${name}`);
    return result;
  };
  const subnets = outputs.private_subnet_ids?.value;
  if (!Array.isArray(subnets) || subnets.length < 2 || !subnets.every(item => typeof item === "string")) throw new Error("Private subnet outputs required");
  return {
    cluster: value("cluster_name"), taskDefinition: value("migration_task_definition"),
    launchType: "FARGATE", count: 1, startedBy: "authforge-migration", clientToken: randomUUID(),
    networkConfiguration: {awsvpcConfiguration: {subnets, securityGroups: [value("migration_security_group_id")], assignPublicIp: "DISABLED"}}
  };
}

function main(): void {
  // This script is prepared for a future approved evaluation. It is not used locally.
  if (process.env.AUTHFORGE_ALLOW_BILLABLE_AWS !== "yes") throw new Error("AWS migration is disabled. Explicit approval is required because Fargate incurs charges.");
  const account = process.env.AUTHFORGE_EXPECTED_ACCOUNT_ID;
  const profile = process.env.AWS_PROFILE;
  if (!account || !/^\d{12}$/.test(account) || !profile) throw new Error("An explicit AWS_PROFILE and expected account ID are required");
  const outputs: Outputs = JSON.parse(execFileSync("terraform", ["-chdir=infra", "output", "-json"], {encoding: "utf8"}));
  const region = outputs.aws_region?.value;
  if (typeof region !== "string") throw new Error("AWS region output required");
  const aws = (args: string[]): Record<string, unknown> => JSON.parse(execFileSync("aws", [...args, "--profile", profile, "--region", region, "--output", "json", "--no-cli-pager"], {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}));
  if (aws(["sts", "get-caller-identity"]).Account !== account) throw new Error("AWS account does not match the explicitly selected evaluation account");
  const identity = outputs.ses_identity?.value;
  if (typeof identity !== "string") throw new Error("SES identity output required");
  if (aws(["sesv2", "get-email-identity", "--email-identity", identity]).VerifiedForSendingStatus !== true) throw new Error("Wait for SES DNS verification before starting the evaluation");
  const request = migrationRequest(outputs);
  const launched = aws(["ecs", "run-task", "--cli-input-json", JSON.stringify(request)]);
  const failures = launched.failures as unknown[] | undefined;
  const taskArn = (launched.tasks as {taskArn?: string}[] | undefined)?.[0]?.taskArn;
  if (failures?.length || !taskArn) throw new Error("Migration task did not start");
  execFileSync("aws", ["ecs", "wait", "tasks-stopped", "--cluster", request.cluster, "--tasks", taskArn, "--profile", profile, "--region", region, "--no-cli-pager"], {stdio: ["ignore", "pipe", "pipe"]});
  const result = aws(["ecs", "describe-tasks", "--cluster", request.cluster, "--tasks", taskArn]);
  const task = (result.tasks as {containers?: {exitCode?: number}[]}[] | undefined)?.[0];
  if (!task?.containers?.length || task.containers.some(container => container.exitCode !== 0)) throw new Error("Migration failed. Inspect its redacted CloudWatch logs; keep services stopped.");
  process.stdout.write("Migration completed. Services may now be enabled through a reviewed Terraform plan.\n");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {main();} catch (error) {
    process.stderr.write(`${error instanceof Error && !("stderr" in error) ? error.message : "Migration command failed; inspect redacted task logs."}\n`);
    process.exitCode = 1;
  }
}
