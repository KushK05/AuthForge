import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const terraform = ["-chdir=infra/classroom"];
const tfvars = process.env.AUTHFORGE_CLASSROOM_TFVARS ?? "classroom.tfvars";
const capture = (command: string, args: string[], env = process.env): string => execFileSync(command, args, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env}).trim();
const show = (command: string, args: string[], env = process.env): void => { execFileSync(command, args, {cwd: root, stdio: "inherit", env}); };
const required = (name: string, pattern?: RegExp): string => {
  const value = process.env[name];
  if (!value || (pattern && !pattern.test(value))) throw new Error(`${name} is required`);
  return value;
};
const profile = (): string[] => ["--profile", required("AWS_PROFILE"), "--no-cli-pager"];

export const validateClassroomVariables = (content: string, sha: string, now = new Date()): void => {
  if (!content.includes(`source_sha = "${sha}"`)) throw new Error("source_sha must equal the current full commit SHA");
  if (/203\.0\.113\.10\/32|verified-demo@example\.com|0123456789abcdef/.test(content)) throw new Error("Replace all classroom example values");
  if (/allowed_cidr\s*=\s*"(?:0\.0\.0\.0\/0|::\/0)"/.test(content)) throw new Error("Public ingress is forbidden");
  const deadline = content.match(/^teardown_at\s*=\s*"([^"]+)"/m)?.[1];
  const remaining = deadline ? new Date(deadline).getTime() - now.getTime() : Number.NaN;
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 12 * 60 * 60 * 1000) throw new Error("teardown_at must be within the next 12 hours");
};

const preflight = (strict = true): string => {
  for (const command of strict ? ["aws", "terraform", "git", "node", "npm", "curl"] : ["aws", "terraform"]) {
    const result = spawnSync(command, ["--version"], {stdio: "ignore"});
    if (result.status !== 0) throw new Error(`${command} is required`);
  }
  const path = `${root}/infra/classroom/${tfvars}`;
  if (!existsSync(path)) throw new Error(`Create ignored infra/classroom/${tfvars} from classroom.tfvars.example`);
  const sha = strict ? capture("git", ["rev-parse", "HEAD"]) : "";
  if (strict) {
    if (capture("git", ["status", "--porcelain"])) throw new Error("Commit working-tree changes before deployment");
    validateClassroomVariables(readFileSync(path, "utf8"), sha);
  }
  const expected = required("AUTHFORGE_EXPECTED_ACCOUNT_ID", /^\d{12}$/);
  const actual = capture("aws", ["sts", "get-caller-identity", "--query", "Account", "--output", "text", ...profile()]);
  if (actual !== expected) throw new Error("Selected AWS account does not match AUTHFORGE_EXPECTED_ACCOUNT_ID");
  show("terraform", [...terraform, "init", "-input=false"]);
  show("terraform", [...terraform, "validate"]);
  return sha;
};

const approval = (word: "DEPLOY" | "DESTROY"): void => {
  if (word === "DEPLOY" && process.env.AUTHFORGE_ALLOW_BILLABLE_AWS !== "yes") throw new Error("Set AUTHFORGE_ALLOW_BILLABLE_AWS=yes after reviewing the deployment plan");
  if (process.env.AUTHFORGE_CONFIRM !== word) throw new Error(`Set AUTHFORGE_CONFIRM=${word} after reviewing the plan`);
};
const output = (name: string): string => capture("terraform", [...terraform, "output", "-raw", name]);

const verifySesSender = (): void => {
  const vars = readFileSync(`${root}/infra/classroom/${tfvars}`, "utf8");
  const region = vars.match(/^aws_region\s*=\s*"([^"]+)"/m)?.[1];
  const sender = vars.match(/^ses_from_email\s*=\s*"([^"]+)"/m)?.[1];
  if (!region || !sender) throw new Error("aws_region and ses_from_email are required");
  const verified = capture("aws", ["sesv2", "get-email-identity", "--email-identity", sender, "--query", "VerifiedForSendingStatus", "--output", "text", "--region", region, ...profile()]);
  if (verified !== "True") throw new Error("SES sender must already be verified in the selected region");
};

const planDeploy = (): void => {
  preflight();
  verifySesSender();
  const plan = "classroom-deploy.tfplan";
  show("terraform", [...terraform, "plan", "-input=false", `-var-file=${tfvars}`, `-out=${plan}`]);
  show("terraform", [...terraform, "show", "-no-color", plan]);
  process.stdout.write("Deployment plan created. Review it, then run the guarded deploy command. No resources were created.\n");
};

const deploy = (): void => {
  const plan = "classroom-deploy.tfplan";
  if (!existsSync(`${root}/infra/classroom/${plan}`)) throw new Error("Run the plan command and review its output before deployment");
  approval("DEPLOY");
  preflight();
  show("terraform", [...terraform, "apply", "-input=false", "-auto-approve", plan]);
  const url = output("showcase_url");
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if (capture("curl", ["--fail", "--silent", `${url}/health/ready`])) { process.stdout.write(`Classroom showcase ready: ${url}\n`); return; } } catch { /* booting */ }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000);
  }
  throw new Error("EC2 did not become ready within 10 minutes; inspect its console output and CloudWatch logs, then destroy if unresolved");
};

const smoke = (): void => {
  preflight(false);
  show(process.execPath, ["--import", "tsx", "scripts/demo-smoke.ts"], {...process.env, AUTHFORGE_BASE_URL: output("showcase_url"), CONSOLE_ACCESS_CODE: output("console_access_code")});
};

const status = (): void => {
  preflight(false);
  process.stdout.write(`URL: ${output("showcase_url")}\nEC2: ${output("instance_id")}\nRDS: ${output("database_identifier")}\nS3: ${output("artifact_bucket")}\nCloudWatch: ${output("log_group")}\nSES sender: ${output("ses_sender")}\nTeardown: ${output("teardown_at")}\n`);
};

const planDestroy = (): void => {
  preflight(false);
  const plan = "classroom-destroy.tfplan";
  show("terraform", [...terraform, "plan", "-destroy", "-input=false", `-var-file=${tfvars}`, `-out=${plan}`]);
  show("terraform", [...terraform, "show", "-no-color", plan]);
  process.stdout.write("Destroy plan created. Review it, then run the guarded destroy command. No resources were changed.\n");
};

const destroy = (): void => {
  const plan = "classroom-destroy.tfplan";
  if (!existsSync(`${root}/infra/classroom/${plan}`)) throw new Error("Run the destroy-plan command and review its output before teardown");
  approval("DESTROY");
  preflight(false);
  show("terraform", [...terraform, "apply", "-input=false", "-auto-approve", plan]);
  if (capture("terraform", [...terraform, "state", "list"])) throw new Error("Terraform state still contains resources");
  process.stdout.write("Classroom stack destroyed. Verify the five services are absent in the AWS console before ending the evaluation.\n");
};

export const main = (action = process.argv[2]): void => {
  if (action === "preflight") { preflight(); process.stdout.write("Classroom preflight passed; no resources were created.\n"); }
  else if (action === "plan") planDeploy();
  else if (action === "deploy") deploy();
  else if (action === "status") status();
  else if (action === "smoke") smoke();
  else if (action === "destroy-plan") planDestroy();
  else if (action === "destroy") destroy();
  else throw new Error("Usage: npm run classroom:aws -- preflight|plan|deploy|status|smoke|destroy-plan|destroy");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  try { main(action); }
  catch (error) {
    process.stderr.write(`${error instanceof Error && !("stderr" in error) ? error.message : "Classroom AWS command failed; inspect the redacted output."}\n`);
    if (action === "deploy") process.stderr.write("If resources were created, run the guarded destroy command immediately.\n");
    process.exitCode = 1;
  }
}
