import type { AppConfig } from "./config.js";

type LogLevel = AppConfig["logLevel"];
type LogFields = Readonly<Record<string, unknown>>;

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const blockedKeys = new Set([
  "authorization",
  "cookie",
  "email",
  "password",
  "refresh_token",
  "token",
  "api_key"
]);

const redact = (fields: LogFields): LogFields =>
  Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]) =>
      blockedKeys.has(key.toLowerCase()) ? [] : [[key, value]]
    )
  );

export class Logger {
  public constructor(
    private readonly minimumLevel: LogLevel,
    private readonly environment: AppConfig["environment"]
  ) {}

  public debug(message: string, fields: LogFields = {}): void {
    this.write("debug", message, fields);
  }

  public info(message: string, fields: LogFields = {}): void {
    this.write("info", message, fields);
  }

  public warn(message: string, fields: LogFields = {}): void {
    this.write("warn", message, fields);
  }

  public error(message: string, fields: LogFields = {}): void {
    this.write("error", message, fields);
  }

  private write(level: LogLevel, message: string, fields: LogFields): void {
    if (levelWeight[level] < levelWeight[this.minimumLevel]) return;

    process.stdout.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        environment: this.environment,
        ...redact(fields)
      })}\n`
    );
  }
}
