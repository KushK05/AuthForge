import { createPublicKey, generateKeyPairSync, randomUUID, sign as nodeSign, constants, type KeyObject } from "node:crypto";

import { GetPublicKeyCommand, KMSClient, SignCommand } from "@aws-sdk/client-kms";

import type { AppConfig } from "../../platform/config.js";

export type AccessTokenClaims = Readonly<{
  issuer: string;
  /** The owning API key, so verifiers can bind a token to the key that created it. */
  audience: string;
  subject: string;
  sessionId: string;
  issuedAt: Date;
  /** Absolute upper bound, the session expiry. The token never outlives its session. */
  sessionExpiresAt: Date;
}>;

export type IssuedAccessToken = Readonly<{ accessToken: string; expiresIn: number }>;

export type JsonWebKeySet = Readonly<{ keys: readonly Readonly<Record<string, string>>[] }>;

export interface AccessTokenSigner {
  issue(claims: AccessTokenClaims): Promise<IssuedAccessToken>;
  jwks(): Promise<JsonWebKeySet>;
}

const base64UrlJson = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");

const buildSigningInput = (
  claims: AccessTokenClaims,
  keyId: string,
  ttlSeconds: number
): Readonly<{ signingInput: string; expiresIn: number }> => {
  const issuedAt = Math.floor(claims.issuedAt.getTime() / 1_000);
  const sessionEnd = Math.floor(claims.sessionExpiresAt.getTime() / 1_000);
  const expiresAt = Math.min(issuedAt + ttlSeconds, sessionEnd);
  const header = base64UrlJson({ alg: "PS256", typ: "JWT", kid: keyId });
  const payload = base64UrlJson({
    iss: claims.issuer,
    aud: claims.audience,
    sub: claims.subject,
    sid: claims.sessionId,
    iat: issuedAt,
    exp: expiresAt,
    jti: randomUUID()
  });
  return { signingInput: `${header}.${payload}`, expiresIn: Math.max(expiresAt - issuedAt, 0) };
};

const publicJwk = (publicKey: KeyObject, keyId: string): JsonWebKeySet => {
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
  if (jwk.kty !== "RSA") throw new Error("Signing key is not an RSA key");
  return { keys: [{ ...jwk, kid: keyId, alg: "PS256", use: "sig" }] };
};

/** Private key material never enters the process: KMS signs and publishes the public key. */
export class KmsAccessTokenSigner implements AccessTokenSigner {
  public constructor(
    private readonly client: Pick<KMSClient, "send">,
    private readonly keyId: string,
    private readonly ttlSeconds: number
  ) {}

  public async issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const { signingInput, expiresIn } = buildSigningInput(claims, this.keyId, this.ttlSeconds);
    const result = await this.client.send(new SignCommand({
      KeyId: this.keyId,
      Message: Buffer.from(signingInput),
      MessageType: "RAW",
      SigningAlgorithm: "RSASSA_PSS_SHA_256"
    }));
    if (!result.Signature) throw new Error("KMS did not return an access token signature");
    return { accessToken: `${signingInput}.${Buffer.from(result.Signature).toString("base64url")}`, expiresIn };
  }

  public async jwks(): Promise<JsonWebKeySet> {
    const result = await this.client.send(new GetPublicKeyCommand({ KeyId: this.keyId }));
    if (
      !result.PublicKey ||
      result.KeyUsage !== "SIGN_VERIFY" ||
      !result.SigningAlgorithms?.includes("RSASSA_PSS_SHA_256")
    ) {
      throw new Error("KMS key is not compatible with PS256 access tokens");
    }
    return publicJwk(createPublicKey({ key: Buffer.from(result.PublicKey), format: "der", type: "spki" }), this.keyId);
  }
}

/** Ephemeral in-process key for local development and tests only. Never used in production. */
export class LocalAccessTokenSigner implements AccessTokenSigner {
  private readonly keyId = `local-${randomUUID()}`;
  private readonly keys = generateKeyPairSync("rsa", { modulusLength: 2048 });

  public constructor(private readonly ttlSeconds: number) {}

  public async issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const { signingInput, expiresIn } = buildSigningInput(claims, this.keyId, this.ttlSeconds);
    const signature = nodeSign("sha256", Buffer.from(signingInput), {
      key: this.keys.privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST
    });
    return { accessToken: `${signingInput}.${signature.toString("base64url")}`, expiresIn };
  }

  public async jwks(): Promise<JsonWebKeySet> {
    return publicJwk(this.keys.publicKey, this.keyId);
  }
}

export const createAccessTokenSigner = (config: AppConfig): AccessTokenSigner => {
  if (config.kmsJwtSigningKeyId) {
    return new KmsAccessTokenSigner(
      new KMSClient({
        region: config.awsRegion,
        ...(config.awsKmsEndpointUrl ? { endpoint: config.awsKmsEndpointUrl } : {})
      }),
      config.kmsJwtSigningKeyId,
      config.accessTokenTtlSeconds
    );
  }
  if (config.environment === "production" || config.environment === "staging") {
    throw new Error("KMS_JWT_SIGNING_KEY_ID is required outside local development");
  }
  return new LocalAccessTokenSigner(config.accessTokenTtlSeconds);
};
