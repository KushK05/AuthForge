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
  const recipient = content.match(/^auth_email_test_recipient\s*=\s*"([^"]+)"/m)?.[1];
  if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient) || recipient.toLowerCase().endsWith("@authforge.demo")) throw new Error("Configure one real SES-verified auth_email_test_recipient inbox");
  if (/203\.0\.113\.10\/32|verified-demo@example\.com|test-inbox@example\.com|0123456789abcdef/.test(content)) throw new Error("Replace all classroom example values");
  if (!/^allowed_cidr\s*=\s*"\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}"/m.test(content)) throw new Error("allowed_cidr must be an IPv4 CIDR");
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

const verifySesIdentities = (): void => {
  const vars = readFileSync(`${root}/infra/classroom/${tfvars}`, "utf8");
  const region = vars.match(/^aws_region\s*=\s*"([^"]+)"/m)?.[1];
  const sender = vars.match(/^ses_from_email\s*=\s*"([^"]+)"/m)?.[1];
  const recipient = vars.match(/^auth_email_test_recipient\s*=\s*"([^"]+)"/m)?.[1];
  if (!region || !sender || !recipient) throw new Error("aws_region, ses_from_email, and auth_email_test_recipient are required");
  for (const [label, identity] of [["sender", sender], ["test recipient", recipient]] as const) {
    const verified = capture("aws", ["sesv2", "get-email-identity", "--email-identity", identity, "--query", "VerifiedForSendingStatus", "--output", "text", "--region", region, ...profile()]);
    if (verified !== "True") throw new Error(`SES ${label} must already be verified in the selected region`);
  }
};

const planDeploy = (): void => {
  preflight();
  verifySesIdentities();
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
  show(process.execPath, ["--import", "tsx", "scripts/demo-smoke.ts"], {...process.env, AUTHFORGE_BASE_URL: output("showcase_url")});
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

// Stop and start only the hourly-billed compute (EC2 and RDS). Storage, the
// Elastic IP, data, and the URL are kept. These commands read resource IDs from
// Terraform outputs and need no deploy guard, because they create nothing.
const sleep = (ms: number): void => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const awsArgs = (): string[] => {
  const region = readFileSync(`${root}/infra/classroom/${tfvars}`, "utf8").match(/^aws_region\s*=\s*"([^"]+)"/m)?.[1];
  if (!region) throw new Error("aws_region is required in the classroom tfvars file");
  return ["--region", region, "--no-cli-pager", ...(process.env.AWS_PROFILE ? ["--profile", process.env.AWS_PROFILE] : [])];
};
const ec2State = (id: string): string => capture("aws", ["ec2", "describe-instances", "--instance-ids", id, "--query", "Reservations[0].Instances[0].State.Name", "--output", "text", ...awsArgs()]);
const dbState = (id: string): string => capture("aws", ["rds", "describe-db-instances", "--db-instance-identifier", id, "--query", "DBInstances[0].DBInstanceStatus", "--output", "text", ...awsArgs()]);
const waitFor = (label: string, read: () => string, done: (state: string) => boolean, minutes: number): string => {
  for (let elapsed = 0; elapsed < minutes * 60_000; elapsed += 15_000) {
    const state = read();
    if (done(state)) return state;
    process.stdout.write(`  ${label}: ${state}, waiting...\n`);
    sleep(15_000);
  }
  throw new Error(`${label} did not settle within ${minutes} minutes; check the AWS console`);
};

const power = (): void => {
  const instance = output("instance_id"), database = output("database_identifier");
  process.stdout.write(`URL: ${output("showcase_url")}\nEC2 ${instance}: ${ec2State(instance)}\nRDS ${database}: ${dbState(database)}\n`);
};

const stop = (): void => {
  const instance = output("instance_id"), database = output("database_identifier");
  const ec2 = ec2State(instance);
  if (ec2 === "running" || ec2 === "pending") {
    capture("aws", ["ec2", "stop-instances", "--instance-ids", instance, ...awsArgs()]);
    process.stdout.write("Stopping EC2...\n");
  }
  waitFor("EC2", () => ec2State(instance), (state) => state === "stopped", 10);
  const db = waitFor("RDS", () => dbState(database), (state) => ["available", "stopped", "stopping"].includes(state), 20);
  if (db === "available") capture("aws", ["rds", "stop-db-instance", "--db-instance-identifier", database, ...awsArgs()]);
  process.stdout.write("Stopped. EC2 is off and RDS is stopping (it finishes on its own in a few minutes).\nStorage and the public IP still cost about US$0.15-0.25 per day. AWS restarts a stopped RDS instance automatically after 7 days.\nRun `npm run classroom:start` to bring it back.\n");
};

const start = (): void => {
  const instance = output("instance_id"), database = output("database_identifier"), url = output("showcase_url");
  let db = waitFor("RDS", () => dbState(database), (state) => ["available", "stopped", "starting"].includes(state), 20);
  if (db === "stopped") { capture("aws", ["rds", "start-db-instance", "--db-instance-identifier", database, ...awsArgs()]); process.stdout.write("Starting RDS (usually 5-10 minutes)...\n"); }
  db = waitFor("RDS", () => dbState(database), (state) => state === "available", 20);
  const ec2 = waitFor("EC2", () => ec2State(instance), (state) => ["running", "pending", "stopped"].includes(state), 10);
  if (ec2 === "stopped") { capture("aws", ["ec2", "start-instances", "--instance-ids", instance, ...awsArgs()]); process.stdout.write("Starting EC2...\n"); }
  waitFor("EC2", () => ec2State(instance), (state) => state === "running", 10);
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if (capture("curl", ["--fail", "--silent", `${url}/health/ready`])) { process.stdout.write(`Running: ${url}\n`); return; } } catch { /* app booting */ }
    sleep(10_000);
  }
  throw new Error("EC2 and RDS are running but the app did not report ready within 5 minutes; check CloudWatch logs");
};

export const main = (action = process.argv[2]): void => {
  if (action === "preflight") { preflight(); process.stdout.write("Classroom preflight passed; no resources were created.\n"); }
  else if (action === "plan") planDeploy();
  else if (action === "deploy") deploy();
  else if (action === "status") status();
  else if (action === "smoke") smoke();
  else if (action === "destroy-plan") planDestroy();
  else if (action === "destroy") destroy();
  else if (action === "stop") stop();
  else if (action === "start") start();
  else if (action === "power") power();
  else throw new Error("Usage: npm run classroom:aws -- preflight|plan|deploy|status|smoke|destroy-plan|destroy|stop|start|power");
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
