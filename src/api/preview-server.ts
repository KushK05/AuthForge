import { Logger } from "../platform/logger.js";
import { MemoryShowcaseStore } from "../platform/memory-store.js";
import { MemoryConsoleRateLimiter } from "../platform/redis.js";
import type { AppConfig } from "../platform/config.js";
import { buildApi } from "./app.js";

const config: AppConfig = {
  environment: "development",
  host: "127.0.0.1",
  port: 8080,
  logLevel: "info",
  databaseUrl: "postgres://mock",
  redisUrl: "redis://mock",
  awsRegion: "us-east-1",
  consoleAccessCode: "authforge-dev-secret-code-2026",
  credentialHashKey: "showcase-credential-hash-key-at-least-32-chars",
  consoleOrigin: "http://127.0.0.1:8080",
  defaultSessionTtlSeconds: 900,
  maxSessionTtlSeconds: 3_600,
  maxSubjectLength: 128,
  maxApiKeys: 100,
  maxSessions: 1_000,
  maxConsoleSessions: 20,
  secureCookies: false
};

const store = new MemoryShowcaseStore();
const rateLimiter = new MemoryConsoleRateLimiter();
const logger = new Logger(config.logLevel, config.environment);
const api = buildApi(config, store, rateLimiter, logger);

const server = await api.listen({ host: config.host, port: config.port });
logger.info(`AuthForge developer console preview running at ${server}`);
