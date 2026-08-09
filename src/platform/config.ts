import { existsSync } from "node:fs";

import { z } from "zod";

const environmentSchema = z.enum(["development", "test", "staging", "production"]);

const configurationSchema = z.object({
  NODE_ENV: environmentSchema.default("development"),
  HOST: z.string().ip().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AWS_REGION: z.string().min(1),
  API_KEY_HASH_KEY: z.string().min(32),
  PUBLIC_ISSUER_BASE_URL: z.string().url().default("http://localhost:8080"),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(12).max(128).default(12),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(19_456).max(1_048_576).default(19_456),
  ARGON2_ITERATIONS: z.coerce.number().int().min(2).max(10).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(16).default(1)
});

export type AppConfig = Readonly<{
  environment: z.infer<typeof environmentSchema>;
  host: string;
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  databaseUrl: string;
  redisUrl: string;
  awsRegion: string;
  apiKeyHashKey: string;
  publicIssuerBaseUrl: string;
  passwordMinLength: number;
  argon2: Readonly<{
    memoryKiB: number;
    iterations: number;
    parallelism: number;
  }>;
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
    apiKeyHashKey: parsed.data.API_KEY_HASH_KEY,
    publicIssuerBaseUrl: parsed.data.PUBLIC_ISSUER_BASE_URL,
    passwordMinLength: parsed.data.PASSWORD_MIN_LENGTH,
    argon2: {
      memoryKiB: parsed.data.ARGON2_MEMORY_KIB,
      iterations: parsed.data.ARGON2_ITERATIONS,
      parallelism: parsed.data.ARGON2_PARALLELISM
    }
  };
};
