import { constants, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

import { GetPublicKeyCommand, SignCommand } from "@aws-sdk/client-kms";
import { describe, expect, it } from "vitest";

import {
  KmsAccessTokenSigner,
  LocalAccessTokenSigner,
  type AccessTokenClaims,
  type JsonWebKeySet
} from "../../src/modules/sessions/access-token-signer.js";

const issuedAt = new Date("2026-10-22T10:00:00Z");
const epoch = Math.floor(issuedAt.getTime() / 1_000);
const claims = (sessionExpiresAt: Date): AccessTokenClaims => ({
  issuer: "https://authforge.example",
  audience: "api-key-1",
  subject: "demo-user-1",
  sessionId: "session-1",
  issuedAt,
  sessionExpiresAt
});

const verifyToken = (token: string, jwks: JsonWebKeySet): Record<string, unknown> => {
  const [header, payload, signature] = token.split(".") as [string, string, string];
  const jwk = jwks.keys[0]!;
  expect(JSON.parse(Buffer.from(header, "base64url").toString())).toMatchObject({ alg: "PS256", kid: jwk.kid });
  const valid = verify(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    { key: createPublicKey({ key: jwk as never, format: "jwk" }), padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST },
    Buffer.from(signature, "base64url")
  );
  expect(valid).toBe(true);
  return JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
};

describe("LocalAccessTokenSigner", () => {
  it("issues a PS256 token an independent verifier accepts via the JWKS", async () => {
    const signer = new LocalAccessTokenSigner(300);
    const { accessToken, expiresIn } = await signer.issue(claims(new Date("2026-10-22T11:00:00Z")));
    const payload = verifyToken(accessToken, await signer.jwks());

    expect(expiresIn).toBe(300);
    expect(payload).toMatchObject({
      iss: "https://authforge.example",
      aud: "api-key-1",
      sub: "demo-user-1",
      sid: "session-1",
      iat: epoch,
      exp: epoch + 300
    });
    expect(payload.jti).toEqual(expect.any(String));
  });

  it("never outlives the session", async () => {
    const signer = new LocalAccessTokenSigner(300);
    const { accessToken, expiresIn } = await signer.issue(claims(new Date("2026-10-22T10:01:00Z")));
    expect(expiresIn).toBe(60);
    expect(verifyToken(accessToken, await signer.jwks()).exp).toBe(epoch + 60);
  });

  it("rejects a tampered payload", async () => {
    const signer = new LocalAccessTokenSigner(300);
    const { accessToken } = await signer.issue(claims(new Date("2026-10-22T11:00:00Z")));
    const [header, , signature] = accessToken.split(".") as [string, string, string];
    const forged = Buffer.from(JSON.stringify({ sub: "attacker" })).toString("base64url");
    const jwks = await signer.jwks();
    expect(() => verifyToken(`${header}.${forged}.${signature}`, jwks)).toThrow();
  });
});

describe("KmsAccessTokenSigner", () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const calls: unknown[] = [];
  const client = {
    send: async (command: unknown) => {
      calls.push(command);
      if (command instanceof GetPublicKeyCommand) {
        return {
          PublicKey: pair.publicKey.export({ format: "der", type: "spki" }),
          KeyUsage: "SIGN_VERIFY",
          SigningAlgorithms: ["RSASSA_PSS_SHA_256"]
        };
      }
      if (command instanceof SignCommand) {
        return {
          Signature: sign("sha256", Buffer.from(command.input.Message as Uint8Array), {
            key: pair.privateKey,
            padding: constants.RSA_PKCS1_PSS_PADDING,
            saltLength: constants.RSA_PSS_SALTLEN_DIGEST
          })
        };
      }
      throw new Error("unexpected command");
    }
  } as never;

  it("signs through KMS and publishes the KMS public key as the JWKS", async () => {
    const signer = new KmsAccessTokenSigner(client, "kms-key-id", 300);
    const { accessToken } = await signer.issue(claims(new Date("2026-10-22T11:00:00Z")));
    const jwks = await signer.jwks();

    expect(jwks.keys[0]).toMatchObject({ kty: "RSA", kid: "kms-key-id", alg: "PS256", use: "sig" });
    expect(verifyToken(accessToken, jwks).sub).toBe("demo-user-1");
    const sign = calls.find((call) => call instanceof SignCommand) as SignCommand;
    expect(sign.input.SigningAlgorithm).toBe("RSASSA_PSS_SHA_256");
  });

  it("refuses a KMS key that cannot produce PS256 signatures", async () => {
    const wrong = { send: async () => ({ PublicKey: new Uint8Array([1]), KeyUsage: "ENCRYPT_DECRYPT" }) } as never;
    await expect(new KmsAccessTokenSigner(wrong, "k", 300).jwks()).rejects.toThrow("not compatible");
  });
});
