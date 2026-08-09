import { describe, expect, it } from "vitest";

import { deriveEmailToken, hashEmailToken, matchesEmailToken } from "../../src/modules/identity/domain/email-token.js";

describe("derived email tokens", () => {
  it("reconstructs a stable opaque token without storing its raw value", () => {
    const key = "test-token-derivation-key-with-32-bytes";
    const token = deriveEmailToken("6b1617e4-9a45-4cc9-869e-d9d7d9d3e401", key);
    expect(token).toMatch(/^v1\.[0-9a-f-]+\.[A-Za-z0-9_-]{43}$/);
    expect(matchesEmailToken("6b1617e4-9a45-4cc9-869e-d9d7d9d3e401", token, key)).toBe(true);
    expect(hashEmailToken(token, key)).toHaveLength(32);
  });
});
