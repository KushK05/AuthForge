import { describe, expect, it, vi } from "vitest";
import { RedisValidationHints } from "../../src/platform/validation-hints.js";

describe("validation hints", () => {
  it("stores only identifiers with a short TTL and degrades safely on Redis failure", async () => {
    const redis = {get: vi.fn(async () => "session-id"), set: vi.fn(async () => "OK" as const), del: vi.fn(async () => 1)};
    const hints = new RedisValidationHints(redis);
    const digest = Buffer.from("digest");
    await hints.remember("key-id", digest, "session-id", new Date(Date.now() + 60000));
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), "session-id", "EX", 30);
    expect(await hints.get("key-id", digest)).toBe("session-id");
    redis.get.mockRejectedValue(new Error("offline"));
    expect(await hints.get("key-id", digest)).toBeUndefined();
    redis.set.mockRejectedValue(new Error("offline"));
    await expect(hints.remember("key-id", digest, "session-id", new Date(Date.now() + 60000))).resolves.toBeUndefined();
  });
});
