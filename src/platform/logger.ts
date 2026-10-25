import type { AppConfig } from "./config.js";

type LogLevel = AppConfig["logLevel"];
type LogFields = Readonly<Record<string, unknown>>;

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const sensitiveSubstrings = [
  "secret",
  "password",
  "token",
  "cookie",
  "accesscode",
  "subject",
  "digest",
  "authorization",
  "apikey"
];

const secretPattern = /(?:sk|cs|csrf|sess|usr)_[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9_.-]+/gi;

const isBlockedKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  return sensitiveSubstrings.some((substring) => normalized.includes(substring));
};

export const redactValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return value.replace(secretPattern, "[REDACTED]");
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
};

export const redactObject = (fields: Record<string, unknown>): Record<string, unknown> => {
  const entries: [string, unknown][] = [];
  for (const [key, val] of Object.entries(fields)) {
    if (isBlockedKey(key)) {
      continue;
    }
    entries.push([key, redactValue(val)]);
  }
  return Object.fromEntries(entries);
};

export class Logger {
  public constructor(
    private readonly minimumLevel: LogLevel,
    private readonly environment: AppConfig["environment"],
    private readonly output: (message: string) => void = (line) => process.stdout.write(line)
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

    this.output(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        environment: this.environment,
        ...redactObject(fields)
      })}\n`
    );
  }
}

