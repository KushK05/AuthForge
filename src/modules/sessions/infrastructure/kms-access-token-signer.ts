import { createPublicKey, randomUUID } from "node:crypto";

import { GetPublicKeyCommand, KMSClient, SignCommand } from "@aws-sdk/client-kms";

import type {
  AccessTokenClaims,
  AccessTokenJwksProvider,
  AccessTokenSigner,
  JsonWebKeySet
} from "../application/access-token-signer.js";
import type { AppConfig } from "../../../platform/config.js";

const accessTokenLifetimeSeconds = 15 * 60;

const base64UrlJson = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");

export class KmsAccessTokenSigner implements AccessTokenSigner, AccessTokenJwksProvider {
  public constructor(
    private readonly client: Pick<KMSClient, "send">,
    private readonly keyId: string
  ) {}

  public async issue(claims: AccessTokenClaims): Promise<Readonly<{ accessToken: string; expiresIn: number }>> {
    const issuedAt = Math.floor(claims.issuedAt.getTime() / 1_000);
    const header = base64UrlJson({ alg: "PS256", typ: "JWT", kid: this.keyId });
    const payload = base64UrlJson({
      iss: claims.issuer,
      aud: claims.audience,
      sub: claims.subject,
      exp: issuedAt + accessTokenLifetimeSeconds,
      iat: issuedAt,
      jti: randomUUID(),
      sid: claims.sessionId,
      project_id: claims.projectId,
      token_version: claims.tokenVersion,
      roles: claims.roles,
      scope: claims.scope
    });
    const signingInput = `${header}.${payload}`;
    const result = await this.client.send(new SignCommand({
      KeyId: this.keyId,
      Message: Buffer.from(signingInput),
      MessageType: "RAW",
      SigningAlgorithm: "RSASSA_PSS_SHA_256"
    }));
    if (!result.Signature) throw new Error("KMS did not return an access token signature");
    return { accessToken: `${signingInput}.${Buffer.from(result.Signature).toString("base64url")}`, expiresIn: accessTokenLifetimeSeconds };
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
    const publicKey = createPublicKey({ key: Buffer.from(result.PublicKey), format: "der", type: "spki" });
    const jwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
    if (jwk.kty !== "RSA") throw new Error("KMS key is not an RSA signing key");
    return { keys: [{ ...jwk, kid: this.keyId, alg: "PS256", use: "sig" }] };
  }
}

export const createKmsAccessTokenSigner = (config: AppConfig): KmsAccessTokenSigner | undefined =>
  config.kmsJwtSigningKeyId
    ? new KmsAccessTokenSigner(
      new KMSClient({
        region: config.awsRegion,
        ...(config.awsKmsEndpointUrl ? { endpoint: config.awsKmsEndpointUrl } : {})
      }),
      config.kmsJwtSigningKeyId
    )
    : undefined;
