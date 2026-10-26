import { existsSync } from "node:fs";

import { z } from "zod";

const environmentSchema = z.enum(["development", "test", "staging", "production"]);
const optionalUrl = z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional());
const optionalString = z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional());
const optionalEmail = z.preprocess((value) => value === "" ? undefined : value, z.string().email().optional());

const configurationSchema = z.object({
  NODE_ENV: environmentSchema.default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AWS_REGION: z.string().min(1).default("us-east-1"),
  AWS_SQS_ENDPOINT_URL: optionalUrl,
  SHOWCASE_QUEUE_URL: optionalUrl,
  SHOWCASE_S3_BUCKET: optionalString,
  SHOWCASE_S3_KMS_KEY_ID: optionalString,
  SHOWCASE_SES_FROM_EMAIL: optionalEmail,
  SHOWCASE_SES_SIMULATOR_EMAIL: optionalEmail,
  CLASSROOM_DIRECT_EVENTS: z.enum(["true", "false"]).default("false"),
  CONSOLE_ACCESS_CODE: z.string().min(16),
  CREDENTIAL_HASH_KEY: z.string().min(32),
  CONSOLE_ORIGIN: z.string().url().default("http://127.0.0.1:8080"),
  DEFAULT_SESSION_TTL_SECONDS: z.coerce.number().int().min(30).max(86_400).default(900),
  MAX_SESSION_TTL_SECONDS: z.coerce.number().int().min(30).max(604_800).default(3_600),
  MAX_SUBJECT_LENGTH: z.coerce.number().int().min(1).max(256).default(128),
  MAX_API_KEYS: z.coerce.number().int().min(1).max(10_000).default(100),
  MAX_SESSIONS: z.coerce.number().int().min(1).max(100_000).default(1_000),
  MAX_CONSOLE_SESSIONS: z.coerce.number().int().min(1).max(10_000).default(20),
  MAX_REQUEST_BODY_BYTES: z.coerce.number().int().min(1024).max(65536).default(16384),
  MAX_FAILED_CONSOLE_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
  CONSOLE_ATTEMPT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  MAX_DEMO_USERS: z.coerce.number().int().min(1).max(1000).default(100),
  MAX_USER_SESSIONS: z.coerce.number().int().min(1).max(1000).default(100),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  AWS_S3_ENDPOINT_URL: optionalUrl,
  AWS_SES_ENDPOINT_URL: optionalUrl,
  SECURE_COOKIES: z.enum(["true", "false"]).default("false")
});

export type AppConfig = Readonly<{
  environment: z.infer<typeof environmentSchema>;
  host: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  databaseUrl: string;
  redisUrl: string;
  awsRegion: string;
  awsSqsEndpointUrl?: string;
  showcaseQueueUrl?: string;
  showcaseS3Bucket?: string;
  showcaseS3KmsKeyId?: string;
  showcaseSesFromEmail?: string;
  showcaseSesSimulatorEmail?: string;
  consoleAccessCode: string;
  credentialHashKey: string;
  consoleOrigin: string;
  defaultSessionTtlSeconds: number;
  maxSessionTtlSeconds: number;
  maxSubjectLength: number;
  maxApiKeys: number;
  maxSessions: number;
  maxConsoleSessions: number;
  maxRequestBodyBytes?: number;
  maxFailedConsoleAttempts?: number;
  consoleAttemptWindowSeconds?: number;
  maxDemoUsers?: number;
  maxUserSessions?: number;
  workerVisibilityTimeoutSeconds?: number;
  trustProxy?: boolean;
  awsS3EndpointUrl?: string;
  awsSesEndpointUrl?: string;
  secureCookies: boolean;
}>;

export const loadLocalEnvironmentFile = (path = ".env"): void => {
  if (existsSync(path)) process.loadEnvFile(path);
};

export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = configurationSchema.safeParse(environment);

  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid configuration: ${fields}`);
  }

  const data = parsed.data;
  if (data.DEFAULT_SESSION_TTL_SECONDS > data.MAX_SESSION_TTL_SECONDS) throw new Error("Default session TTL exceeds maximum");
  if ((data.NODE_ENV === "production" || data.NODE_ENV === "staging") && (data.SECURE_COOKIES !== "true" || !data.CONSOLE_ORIGIN.startsWith("https://"))) throw new Error("Deployed environments require HTTPS and secure cookies");
  if (data.NODE_ENV === "production" || data.NODE_ENV === "staging") {
    if (new URL(data.DATABASE_URL).searchParams.get("sslmode") !== "verify-full") throw new Error("Deployed PostgreSQL requires sslmode=verify-full");
    if (!data.REDIS_URL.startsWith("rediss://")) throw new Error("Deployed Redis requires TLS");
    if (data.AWS_SQS_ENDPOINT_URL || data.AWS_S3_ENDPOINT_URL || data.AWS_SES_ENDPOINT_URL) throw new Error("Deployed environments cannot use emulator endpoints");
  }
  if (new URL(data.CONSOLE_ORIGIN).origin !== data.CONSOLE_ORIGIN) throw new Error("CONSOLE_ORIGIN must be an exact origin without a path");
  if (data.SHOWCASE_SES_SIMULATOR_EMAIL && !/^(success|bounce|complaint|ooto|suppressionlist)@simulator\.amazonses\.com$/.test(data.SHOWCASE_SES_SIMULATOR_EMAIL)) throw new Error("SES recipient must be an AWS mailbox simulator address");
  if (Boolean(data.SHOWCASE_SES_FROM_EMAIL) !== Boolean(data.SHOWCASE_SES_SIMULATOR_EMAIL)) throw new Error("Configure both SES sender and simulator recipient");
  if (data.SHOWCASE_QUEUE_URL && !data.SHOWCASE_S3_BUCKET) throw new Error("SHOWCASE_S3_BUCKET is required with SHOWCASE_QUEUE_URL");
  return {
    environment: parsed.data.NODE_ENV,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    logLevel: parsed.data.LOG_LEVEL,
    databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL,
    awsRegion: parsed.data.AWS_REGION,
    ...(parsed.data.AWS_SQS_ENDPOINT_URL ? { awsSqsEndpointUrl: parsed.data.AWS_SQS_ENDPOINT_URL } : {}),
    ...(parsed.data.SHOWCASE_QUEUE_URL ? { showcaseQueueUrl: parsed.data.SHOWCASE_QUEUE_URL } : {}),
    ...(parsed.data.SHOWCASE_S3_BUCKET ? { showcaseS3Bucket: parsed.data.SHOWCASE_S3_BUCKET } : {}),
    ...(parsed.data.SHOWCASE_S3_KMS_KEY_ID ? { showcaseS3KmsKeyId: parsed.data.SHOWCASE_S3_KMS_KEY_ID } : {}),
    ...(parsed.data.SHOWCASE_SES_FROM_EMAIL ? { showcaseSesFromEmail: parsed.data.SHOWCASE_SES_FROM_EMAIL } : {}),
    ...(parsed.data.SHOWCASE_SES_SIMULATOR_EMAIL ? { showcaseSesSimulatorEmail: parsed.data.SHOWCASE_SES_SIMULATOR_EMAIL } : {}),
    consoleAccessCode: parsed.data.CONSOLE_ACCESS_CODE,
    credentialHashKey: parsed.data.CREDENTIAL_HASH_KEY,
    consoleOrigin: parsed.data.CONSOLE_ORIGIN,
    defaultSessionTtlSeconds: parsed.data.DEFAULT_SESSION_TTL_SECONDS,
    maxSessionTtlSeconds: parsed.data.MAX_SESSION_TTL_SECONDS,
    maxSubjectLength: parsed.data.MAX_SUBJECT_LENGTH,
    maxApiKeys: parsed.data.MAX_API_KEYS,
    maxSessions: parsed.data.MAX_SESSIONS,
    maxConsoleSessions: parsed.data.MAX_CONSOLE_SESSIONS,
    maxRequestBodyBytes: parsed.data.MAX_REQUEST_BODY_BYTES,
    maxFailedConsoleAttempts: parsed.data.MAX_FAILED_CONSOLE_ATTEMPTS,
    consoleAttemptWindowSeconds: parsed.data.CONSOLE_ATTEMPT_WINDOW_SECONDS,
    maxDemoUsers: parsed.data.MAX_DEMO_USERS,
    maxUserSessions: parsed.data.MAX_USER_SESSIONS,
    trustProxy: parsed.data.TRUST_PROXY === "true",
    ...(parsed.data.AWS_S3_ENDPOINT_URL ? { awsS3EndpointUrl: parsed.data.AWS_S3_ENDPOINT_URL } : {}),
    ...(parsed.data.AWS_SES_ENDPOINT_URL ? { awsSesEndpointUrl: parsed.data.AWS_SES_ENDPOINT_URL } : {}),
    secureCookies: parsed.data.SECURE_COOKIES === "true"
  };
};

export type MigrationConfig = Pick<AppConfig, "environment" | "logLevel" | "databaseUrl">;
export type WorkerConfig = MigrationConfig & Pick<AppConfig,
  "awsRegion" | "awsSqsEndpointUrl" | "awsS3EndpointUrl" | "awsSesEndpointUrl" |
  "showcaseQueueUrl" | "showcaseS3Bucket" | "showcaseS3KmsKeyId" |
  "showcaseSesFromEmail" | "showcaseSesSimulatorEmail" | "workerVisibilityTimeoutSeconds"
> & Readonly<{classroomDirectEvents?: boolean}>;

const migrationSchema = configurationSchema.pick({NODE_ENV: true, LOG_LEVEL: true, DATABASE_URL: true});
const workerSchema = configurationSchema.pick({
  NODE_ENV: true, LOG_LEVEL: true, DATABASE_URL: true, AWS_REGION: true,
  AWS_SQS_ENDPOINT_URL: true, AWS_S3_ENDPOINT_URL: true, AWS_SES_ENDPOINT_URL: true,
  SHOWCASE_QUEUE_URL: true, SHOWCASE_S3_BUCKET: true, SHOWCASE_S3_KMS_KEY_ID: true,
  SHOWCASE_SES_FROM_EMAIL: true, SHOWCASE_SES_SIMULATOR_EMAIL: true
  , CLASSROOM_DIRECT_EVENTS: true
});
const parseRoleConfig = <T extends z.ZodType>(schema: T, environment: NodeJS.ProcessEnv): z.output<T> => {
  const result = schema.safeParse(environment);
  if (!result.success) throw new Error(`Invalid configuration: ${result.error.issues.map(issue => issue.path.join(".")).join(", ")}`);
  return result.data;
};
const migrationValues = (data: z.output<typeof migrationSchema>): MigrationConfig => {
  if ((data.NODE_ENV === "production" || data.NODE_ENV === "staging") && new URL(data.DATABASE_URL).searchParams.get("sslmode") !== "verify-full") throw new Error("Deployed PostgreSQL requires sslmode=verify-full");
  return {environment: data.NODE_ENV, logLevel: data.LOG_LEVEL, databaseUrl: data.DATABASE_URL};
};
export const loadMigrationConfig = (environment: NodeJS.ProcessEnv = process.env): MigrationConfig =>
  migrationValues(parseRoleConfig(migrationSchema, environment));

export const loadWorkerConfig = (environment: NodeJS.ProcessEnv = process.env): WorkerConfig => {
  const data = parseRoleConfig(workerSchema, environment);
  const base = migrationValues(data);
  if (base.environment === "production" || base.environment === "staging") {
    if (data.AWS_SQS_ENDPOINT_URL || data.AWS_S3_ENDPOINT_URL || data.AWS_SES_ENDPOINT_URL) throw new Error("Deployed environments cannot use emulator endpoints");
    const completeEffects = data.SHOWCASE_S3_BUCKET && data.SHOWCASE_SES_FROM_EMAIL && data.SHOWCASE_SES_SIMULATOR_EMAIL;
    if (data.CLASSROOM_DIRECT_EVENTS === "true" ? !completeEffects : (!data.SHOWCASE_QUEUE_URL || !data.SHOWCASE_S3_KMS_KEY_ID || !completeEffects)) throw new Error("Deployed worker requires its complete event configuration");
  }
  if (data.SHOWCASE_SES_SIMULATOR_EMAIL && !/^(success|bounce|complaint|ooto|suppressionlist)@simulator\.amazonses\.com$/.test(data.SHOWCASE_SES_SIMULATOR_EMAIL)) throw new Error("SES recipient must be an AWS mailbox simulator address");
  if (Boolean(data.SHOWCASE_SES_FROM_EMAIL) !== Boolean(data.SHOWCASE_SES_SIMULATOR_EMAIL)) throw new Error("Configure both SES sender and simulator recipient");
  if (data.SHOWCASE_QUEUE_URL && !data.SHOWCASE_S3_BUCKET) throw new Error("SHOWCASE_S3_BUCKET is required with SHOWCASE_QUEUE_URL");
  return {
    ...base, awsRegion: data.AWS_REGION,
    ...(data.AWS_SQS_ENDPOINT_URL ? {awsSqsEndpointUrl: data.AWS_SQS_ENDPOINT_URL} : {}),
    ...(data.AWS_S3_ENDPOINT_URL ? {awsS3EndpointUrl: data.AWS_S3_ENDPOINT_URL} : {}),
    ...(data.AWS_SES_ENDPOINT_URL ? {awsSesEndpointUrl: data.AWS_SES_ENDPOINT_URL} : {}),
    ...(data.SHOWCASE_QUEUE_URL ? {showcaseQueueUrl: data.SHOWCASE_QUEUE_URL} : {}),
    ...(data.SHOWCASE_S3_BUCKET ? {showcaseS3Bucket: data.SHOWCASE_S3_BUCKET} : {}),
    ...(data.SHOWCASE_S3_KMS_KEY_ID ? {showcaseS3KmsKeyId: data.SHOWCASE_S3_KMS_KEY_ID} : {}),
    ...(data.SHOWCASE_SES_FROM_EMAIL ? {showcaseSesFromEmail: data.SHOWCASE_SES_FROM_EMAIL} : {}),
    ...(data.SHOWCASE_SES_SIMULATOR_EMAIL ? {showcaseSesSimulatorEmail: data.SHOWCASE_SES_SIMULATOR_EMAIL} : {}),
    classroomDirectEvents: data.CLASSROOM_DIRECT_EVENTS === "true"
  };
};
