import { describe, expect, it, vi } from "vitest";

import {
  MemoryConsoleRateLimiter,
  RedisConsoleRateLimiter
} from "../../src/platform/redis.js";
import { ApplicationError } from "../../src/shared/application/errors.js";

describe("ConsoleRateLimiter", () => {
  describe("MemoryConsoleRateLimiter", () => {
    it("allows attempts initially and enforces 429 rate_limited after max attempts", async () => {
      const limiter = new MemoryConsoleRateLimiter(3, 60_000);
      const ip = "127.0.0.1";

      await expect(limiter.assertAllowed(ip)).resolves.toBeUndefined();

      await limiter.recordFailure(ip);
      await limiter.recordFailure(ip);
      await expect(limiter.assertAllowed(ip)).resolves.toBeUndefined();

      await limiter.recordFailure(ip);
      await expect(limiter.assertAllowed(ip)).rejects.toThrow(ApplicationError);
      await expect(limiter.assertAllowed(ip)).rejects.toMatchObject({
        status: 429,
        code: "rate_limited"
      });
    });

    it("resets failure counter on successful login", async () => {
      const limiter = new MemoryConsoleRateLimiter(2, 60_000);
      const ip = "127.0.0.1";

      await limiter.recordFailure(ip);
      await limiter.reset(ip);
      await limiter.recordFailure(ip);

      await expect(limiter.assertAllowed(ip)).resolves.toBeUndefined();
    });
  });

  describe("RedisConsoleRateLimiter", () => {
    it("allows attempts when under limit and rejects with 429 when limit reached", async () => {
      const redisStore = new Map<string, string>();
      const mockRedis = {
        get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
        incr: vi.fn(async (key: string) => {
          const count = Number.parseInt(redisStore.get(key) ?? "0", 10) + 1;
          redisStore.set(key, count.toString());
          return count;
        }),
        expire: vi.fn(async () => 1),
        del: vi.fn(async (key: string) => {
          redisStore.delete(key);
          return 1;
        }),
        ping: vi.fn(async () => "PONG")
      };

      const limiter = new RedisConsoleRateLimiter(mockRedis, 3, 60);
      const ip = "192.168.1.1";

      await expect(limiter.assertAllowed(ip)).resolves.toBeUndefined();

      await limiter.recordFailure(ip);
      expect(mockRedis.incr).toHaveBeenCalledWith("rate_limit:console:192.168.1.1");
      expect(mockRedis.expire).toHaveBeenCalledWith("rate_limit:console:192.168.1.1", 60);

      await limiter.recordFailure(ip);
      await expect(limiter.assertAllowed(ip)).resolves.toBeUndefined();

      await limiter.recordFailure(ip);
      await expect(limiter.assertAllowed(ip)).rejects.toMatchObject({
        status: 429,
        code: "rate_limited"
      });

      await limiter.reset(ip);
      expect(mockRedis.del).toHaveBeenCalledWith("rate_limit:console:192.168.1.1");
      await expect(limiter.assertAllowed(ip)).resolves.toBeUndefined();
    });

    it("fails closed with 503 dependency_unavailable if Redis is down during assertAllowed", async () => {
      const mockRedis = {
        get: vi.fn(async () => {
          throw new Error("Connection refused: ECONNREFUSED");
        }),
        incr: vi.fn(),
        expire: vi.fn(),
        del: vi.fn(),
        ping: vi.fn()
      };

      const limiter = new RedisConsoleRateLimiter(mockRedis, 5, 60);

      await expect(limiter.assertAllowed("10.0.0.1")).rejects.toMatchObject({
        status: 503,
        code: "dependency_unavailable"
      });
    });

    it("fails closed with 503 dependency_unavailable if Redis is down during recordFailure", async () => {
      const mockRedis = {
        get: vi.fn(),
        incr: vi.fn(async () => {
          throw new Error("Redis cluster timeout");
        }),
        expire: vi.fn(),
        del: vi.fn(),
        ping: vi.fn()
      };

      const limiter = new RedisConsoleRateLimiter(mockRedis, 5, 60);

      await expect(limiter.recordFailure("10.0.0.1")).rejects.toMatchObject({
        status: 503,
        code: "dependency_unavailable"
      });
    });

    it("fails closed with 503 dependency_unavailable if Redis is down during reset", async () => {
      const mockRedis = {
        get: vi.fn(),
        incr: vi.fn(),
        expire: vi.fn(),
        del: vi.fn(async () => {
          throw new Error("Redis socket closed");
        }),
        ping: vi.fn()
      };

      const limiter = new RedisConsoleRateLimiter(mockRedis, 5, 60);

      await expect(limiter.reset("10.0.0.1")).rejects.toMatchObject({
        status: 503,
        code: "dependency_unavailable"
      });
    });

    it("readiness fails with 503 dependency_unavailable when ping fails", async () => {
      const mockRedis = {
        get: vi.fn(),
        incr: vi.fn(),
        expire: vi.fn(),
        del: vi.fn(),
        ping: vi.fn(async () => "FAIL")
      };

      const limiter = new RedisConsoleRateLimiter(mockRedis, 5, 60);

      await expect(limiter.ready()).rejects.toMatchObject({
        status: 503,
        code: "dependency_unavailable"
      });
    });
  });
});
