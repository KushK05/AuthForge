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
  PUBLIC_ISSUER_BASE_URL: z.string().url().default("http://localhost:8080")
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
    publicIssuerBaseUrl: parsed.data.PUBLIC_ISSUER_BASE_URL
  };
};
