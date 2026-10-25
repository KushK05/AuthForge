import { randomUUID } from "node:crypto";
import type { AppConfig } from "../../platform/config.js";
import type { ApiKeyRecord, ApplicationSessionRecord, ShowcaseStore } from "../../platform/store.js";
import { invalidRequest } from "../../shared/application/errors.js";
import { generatePrefixedSecret, hashOpaqueSecret } from "../../shared/crypto/opaque-secret.js";

export type IssuedSession = Readonly<{ session: ApplicationSessionRecord; token: string }>;

export class SessionService {
  public constructor(private readonly config: AppConfig, private readonly store: ShowcaseStore) {}

  public async create(apiKey: ApiKeyRecord, subject: string, ttlSeconds = this.config.defaultSessionTtlSeconds): Promise<IssuedSession> {
    if (!subject.trim() || subject.length > this.config.maxSubjectLength || !Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > this.config.maxSessionTtlSeconds) {
      throw invalidRequest("Invalid session request");
    }
    const token = generatePrefixedSecret("sess").value;
    const createdAt = new Date();
    const session: ApplicationSessionRecord = {
      id: randomUUID(), apiKeyId: apiKey.id, subject: subject.trim(),
      tokenDigest: hashOpaqueSecret(token, this.config.credentialHashKey), createdAt,
      expiresAt: new Date(createdAt.getTime() + ttlSeconds * 1_000)
    };
    await this.store.createSession(session, this.config.maxSessions);
    return { session, token };
  }
}
