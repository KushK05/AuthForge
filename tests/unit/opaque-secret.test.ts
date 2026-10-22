import { describe, expect, it } from "vitest";

import {
  generateApiKey,
  hashOpaqueSecret,
  timingSafeBufferEqual,
  timingSafeStringEqual
} from "../../src/shared/crypto/opaque-secret.js";

describe("opaque API keys", () => {
  it("creates a high-entropy secret key and a non-secret display prefix", () => {
    const key = generateApiKey();

    expect(key.value).toMatch(/^sk_[A-Za-z0-9_-]{43}$/);
    expect(key.prefix).toBe(key.value.slice(0, 11));
    expect(key.prefix.length).toBeLessThan(key.value.length);
  });

  it("uses a keyed deterministic hash for persistence", () => {
    expect(hashOpaqueSecret("sk_example", "test-key")).toEqual(
      hashOpaqueSecret("sk_example", "test-key")
    );
    expect(hashOpaqueSecret("sk_example", "test-key")).not.toEqual(
      hashOpaqueSecret("sk_example", "other-key")
    );
  });

  it("performs timing-safe string and buffer comparisons", () => {
    expect(timingSafeStringEqual("secret-code", "secret-code")).toBe(true);
    expect(timingSafeStringEqual("secret-code", "wrong-code")).toBe(false);
    expect(timingSafeStringEqual("short", "longer-string")).toBe(false);

    expect(timingSafeBufferEqual(Buffer.from("abc"), Buffer.from("abc"))).toBe(true);
    expect(timingSafeBufferEqual(Buffer.from("abc"), Buffer.from("xyz"))).toBe(false);
    expect(timingSafeBufferEqual(Buffer.from("abc"), Buffer.from("abcd"))).toBe(false);
  });
});
