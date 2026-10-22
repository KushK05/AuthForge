import { Redis } from "ioredis";

import { rateLimited, unavailableDependency } from "../shared/application/errors.js";

export type ConsoleRateLimiter = Readonly<{
  assertAllowed(ip: string): Promise<void>;
  recordFailure(ip: string): Promise<void>;
  reset(ip: string): Promise<void>;
  ready(): Promise<void>;
  close?(): Promise<void>;
}>;

export class MemoryConsoleRateLimiter implements ConsoleRateLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  public constructor(
    private readonly maxAttempts = 5,
    private readonly windowMs = 60_000
  ) {}

  public async assertAllowed(ip: string): Promise<void> {
    const attempt = this.attempts.get(ip);
    if (attempt && attempt.resetAt > Date.now() && attempt.count >= this.maxAttempts) {
      throw rateLimited();
    }
  }

  public async recordFailure(ip: string): Promise<void> {
    const now = Date.now();
    const attempt = this.attempts.get(ip);
    if (attempt && attempt.resetAt > now) {
      attempt.count += 1;
    } else {
      this.attempts.set(ip, { count: 1, resetAt: now + this.windowMs });
    }
  }

  public async reset(ip: string): Promise<void> {
    this.attempts.delete(ip);
  }

  public async ready(): Promise<void> {}
}

export type RedisClientLike = Readonly<{
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
}>;

export class RedisConsoleRateLimiter implements ConsoleRateLimiter {
  public constructor(
    private readonly redis: RedisClientLike,
    private readonly maxAttempts = 5,
    private readonly windowSeconds = 60,
    private readonly keyPrefix = "rate_limit:console:"
  ) {}

  public async assertAllowed(ip: string): Promise<void> {
    try {
      const raw = await this.redis.get(`${this.keyPrefix}${ip}`);
      if (raw !== null && Number.parseInt(raw, 10) >= this.maxAttempts) {
        throw rateLimited();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "ApplicationError") {
        throw error;
      }
      throw unavailableDependency();
    }
  }

  public async recordFailure(ip: string): Promise<void> {
    const key = `${this.keyPrefix}${ip}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, this.windowSeconds);
      }
    } catch {
      throw unavailableDependency();
    }
  }

  public async reset(ip: string): Promise<void> {
    try {
      await this.redis.del(`${this.keyPrefix}${ip}`);
    } catch {
      throw unavailableDependency();
    }
  }

  public async ready(): Promise<void> {
    try {
      const pong = await this.redis.ping();
      if (pong !== "PONG") {
        throw unavailableDependency();
      }
    } catch {
      throw unavailableDependency();
    }
  }
}

export const createRedisClient = (redisUrl: string): Redis => {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    lazyConnect: true,
    enableOfflineQueue: false
  });
};
