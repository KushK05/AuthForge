import { existsSync } from "node:fs";

import { z } from "zod";

const environmentSchema = z.enum(["development", "test", "staging", "production"]);

const configurationSchema = z.object({
  NODE_ENV: environmentSchema.default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AWS_REGION: z.string().min(1).default("us-east-1"),
  AWS_SQS_ENDPOINT_URL: z.string().url().optional(),
  SHOWCASE_QUEUE_URL: z.string().url().optional(),
  SHOWCASE_S3_BUCKET: z.string().min(1).optional(),
  SHOWCASE_S3_KMS_KEY_ID: z.string().min(1).optional(),
  SHOWCASE_SES_FROM_EMAIL: z.string().email().optional(),
  SHOWCASE_SES_SIMULATOR_EMAIL: z.string().email().optional(),
  CONSOLE_ACCESS_CODE: z.string().min(16),
  CREDENTIAL_HASH_KEY: z.string().min(32),
  CONSOLE_ORIGIN: z.string().url().default("http://127.0.0.1:8080"),
  DEFAULT_SESSION_TTL_SECONDS: z.coerce.number().int().min(30).max(86_400).default(900),
  MAX_SESSION_TTL_SECONDS: z.coerce.number().int().min(30).max(604_800).default(3_600),
  MAX_SUBJECT_LENGTH: z.coerce.number().int().min(1).max(256).default(128),
  MAX_API_KEYS: z.coerce.number().int().min(1).max(10_000).default(100),
  MAX_SESSIONS: z.coerce.number().int().min(1).max(100_000).default(1_000),
  MAX_CONSOLE_SESSIONS: z.coerce.number().int().min(1).max(10_000).default(20),
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
    secureCookies: parsed.data.SECURE_COOKIES === "true"
  };
};
