import { describe, expect, it } from "vitest";

import { hashPassword, validatePassword, verifyPassword } from "../../src/modules/identity/domain/password.js";

describe("password policy", () => {
  it("enforces the centrally configured minimum length", () => {
    expect(() => validatePassword("short", 12)).toThrow("between 12 and 1024");
    expect(() => validatePassword("this password is long enough", 12)).not.toThrow();
  });

  it("hashes and verifies a password using Argon2id", async () => {
    const hash = await hashPassword("this password is long enough", {
      memoryKiB: 19_456,
      iterations: 2,
      parallelism: 1
    });

    expect(hash).toContain("$argon2id$");
    await expect(verifyPassword(hash, "this password is long enough")).resolves.toBe(true);
    await expect(verifyPassword(hash, "incorrect password")).resolves.toBe(false);
  });
});
