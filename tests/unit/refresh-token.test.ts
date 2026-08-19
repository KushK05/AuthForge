import { describe, expect, it } from "vitest";

import { generateRefreshToken, hashRefreshToken } from "../../src/modules/sessions/domain/refresh-token.js";

describe("opaque refresh tokens", () => {
  it("uses 256-bit random values and a keyed persistence hash", () => {
    const token = generateRefreshToken();

    expect(token).toMatch(/^rt_[A-Za-z0-9_-]{43}$/);
    expect(hashRefreshToken(token, "test-api-key-hashing-secret-value")).toHaveLength(32);
  });
});
