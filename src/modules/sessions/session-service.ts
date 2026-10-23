import { randomUUID } from "node:crypto";

import type { AppConfig } from "../../platform/config.js";
import type { ApiKeyRecord, ApplicationSessionRecord, ShowcaseStore } from "../../platform/store.js";
import {
  ApplicationError,
  capacityExceeded,
  invalidCredentials,
  unavailableDependency
} from "../../shared/application/errors.js";
import { generatePrefixedSecret, hashOpaqueSecret } from "../../shared/crypto/opaque-secret.js";
import type { AccessTokenSigner } from "./access-token-signer.js";

export type IssuedSession = Readonly<{
  session: ApplicationSessionRecord;
  /** Opaque rotating session token. Returned once per issue or refresh. */
  token: string;
  accessToken: string;
  accessTokenExpiresIn: number;
}>;

export class SessionService {
  public constructor(
    private readonly config: AppConfig,
    private readonly store: ShowcaseStore,
    private readonly signer: AccessTokenSigner
  ) {}

  public async create(apiKey: ApiKeyRecord, subject: string, ttlSeconds?: number): Promise<IssuedSession> {
    if (await this.store.countSessions() >= this.config.maxSessions) throw capacityExceeded();

    const token = generatePrefixedSecret("sess").value;
    const createdAt = new Date();
    const session: ApplicationSessionRecord = {
      id: randomUUID(),
      apiKeyId: apiKey.id,
      subject,
      tokenDigest: this.digest(token),
      createdAt,
      expiresAt: new Date(createdAt.getTime() + (ttlSeconds ?? this.config.defaultSessionTtlSeconds) * 1_000)
    };

    // Sign before persisting so a signing outage never leaves an unreachable session behind.
    const access = await this.signAccessToken(session, createdAt);
    await this.store.createSession(session);
    return { session, token, ...access };
  }

  /**
   * Rotates the opaque token. The absolute session expiry never extends. Presenting an
   * already-rotated token revokes the session, since it signals a copied credential.
   */
  public async refresh(apiKey: ApiKeyRecord, presentedToken: string): Promise<IssuedSession> {
    const now = new Date();
    const presentedDigest = this.digest(presentedToken);
    const current = await this.store.findSession(apiKey.id, presentedDigest, now);

    if (!current) {
      await this.store.revokeReplayedSession(apiKey.id, presentedDigest, now);
      throw invalidCredentials("invalid_session");
    }

    const token = generatePrefixedSecret("sess").value;
    const access = await this.signAccessToken(current, now);
    const rotated = await this.store.rotateSession(current.id, presentedDigest, this.digest(token), now);
    if (!rotated) throw invalidCredentials("invalid_session");

    return { session: { ...current, tokenDigest: this.digest(token) }, token, ...access };
  }

  private digest(token: string): Buffer {
    return hashOpaqueSecret(token, this.config.credentialHashKey);
  }

  private async signAccessToken(
    session: ApplicationSessionRecord,
    issuedAt: Date
  ): Promise<Readonly<{ accessToken: string; accessTokenExpiresIn: number }>> {
    try {
      const issued = await this.signer.issue({
        issuer: this.config.consoleOrigin,
        audience: session.apiKeyId,
        subject: session.subject,
        sessionId: session.id,
        issuedAt,
        sessionExpiresAt: session.expiresAt
      });
      return { accessToken: issued.accessToken, accessTokenExpiresIn: issued.expiresIn };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw unavailableDependency();
    }
  }
}
