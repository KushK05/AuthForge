import { describe, expect, it } from "vitest";

import { generateApiKey, hashOpaqueSecret } from "../../src/shared/crypto/opaque-secret.js";

describe("opaque API keys", () => {
  it("creates a high-entropy secret key and a non-secret display prefix", () => {
    const key = generateApiKey("secret");

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
});
