import { constants, generateKeyPairSync, sign, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import { GetPublicKeyCommand, SignCommand, type KMSClient } from "@aws-sdk/client-kms";

import { KmsAccessTokenSigner } from "../../src/modules/sessions/infrastructure/kms-access-token-signer.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keyId = "local-kms-signing-key";
const signer = new KmsAccessTokenSigner({
  send: async (command: unknown) => {
    if (command instanceof SignCommand) {
      return {
        Signature: sign("sha256", command.input.Message as Buffer, {
          key: privateKey,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: constants.RSA_PSS_SALTLEN_DIGEST
        })
      };
    }
    if (command instanceof GetPublicKeyCommand) {
      return {
        PublicKey: publicKey.export({ format: "der", type: "spki" }),
        KeyUsage: "SIGN_VERIFY",
        SigningAlgorithms: ["RSASSA_PSS_SHA_256"]
      };
    }
    throw new Error("Unexpected KMS command");
  }
} as Pick<KMSClient, "send">, keyId);

describe("KmsAccessTokenSigner", () => {
  it("issues a PS256 JWT and exposes the corresponding JWK", async () => {
    const issued = await signer.issue({
      issuer: "https://authforge.test/v1/projects/project-1", audience: "environment-1", subject: "user-1",
      sessionId: "session-1", projectId: "project-1", tokenVersion: 0, roles: ["Reader"], scope: [],
      issuedAt: new Date("2026-08-19T00:00:00.000Z")
    });
    const [header, payload, signature] = issued.accessToken.split(".");
    const verified = verify("sha256", Buffer.from(`${header}.${payload}`), {
      key: publicKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST
    }, Buffer.from(signature ?? "", "base64url"));

    expect(verified).toBe(true);
    expect(JSON.parse(Buffer.from(payload ?? "", "base64url").toString())).toMatchObject({
      aud: "environment-1", project_id: "project-1", sid: "session-1", roles: ["Reader"]
    });
    await expect(signer.jwks()).resolves.toMatchObject({ keys: [{ kid: keyId, alg: "PS256", kty: "RSA" }] });
  });
});
