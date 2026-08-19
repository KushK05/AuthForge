import { describe, expect, it, vi } from "vitest";

import { hashPassword } from "../../src/modules/identity/domain/password.js";
import type { AccessTokenClaims } from "../../src/modules/sessions/application/access-token-signer.js";
import { signIn, type SignInDependencies } from "../../src/modules/sessions/application/sign-in.js";

const now = new Date("2026-08-19T00:00:00.000Z");

describe("signIn", () => {
  it("issues claims for an active user and persists the matching session", async () => {
    let signedClaims: AccessTokenClaims | undefined;
    let storedSessionId: string | undefined;
    const createSession = vi.fn(async (input: Readonly<{ id: string }>) => {
      storedSessionId = input.id;
    });
    const issue = vi.fn(async (claims: AccessTokenClaims) => {
      signedClaims = claims;
      return { accessToken: "signed-token", expiresIn: 900 };
    });
    const dependencies: SignInDependencies = {
      userCredentials: {
        findUserForSignIn: async () => ({
          id: "user-1",
          email: "person@example.test",
          passwordHash: await hashPassword("this password is long enough", {
            memoryKiB: 19_456, iterations: 2, parallelism: 1
          }),
          status: "active",
          tokenVersion: 3
        })
      },
      projectEnvironment: {
        findDefaultEnvironment: async () => ({
          issuer: "https://authforge.test/v1/projects/project-1",
          audience: "environment-1"
        })
      },
      userRoles: { findUserAuthorizationClaims: async () => ({ roles: ["Member"], scope: ["profile:read"] }) },
      sessions: {
        transaction: async (operation) => operation({
          createSession,
          createRefreshTokenFamily: async () => undefined,
          createRefreshToken: async () => undefined,
          appendAuditEvent: async () => undefined
        })
      },
      accessTokenSigner: { issue }
    };

    const result = await signIn(dependencies, {
      projectId: "project-1",
      email: "PERSON@example.test",
      password: "this password is long enough",
      refreshTokenHashKey: "test-api-key-hashing-secret-value",
      correlationId: "request_12345678",
      now
    });

    expect(result).toMatchObject({
      accessToken: "signed-token",
      expiresIn: 900,
      user: { id: "user-1", email: "person@example.test", status: "active" }
    });
    expect(result.refreshToken).toMatch(/^rt_[A-Za-z0-9_-]{43}$/);
    expect(signedClaims).toMatchObject({ projectId: "project-1", subject: "user-1", roles: ["Member"], scope: ["profile:read"] });
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String), projectId: "project-1", userId: "user-1"
    }));
    expect(signedClaims?.sessionId).toBe(storedSessionId);
  });
});
