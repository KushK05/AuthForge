import { randomUUID } from "node:crypto";

import type { AppConfig } from "../../platform/config.js";
import type { ConsoleRateLimiter } from "../../platform/redis.js";
import type {
  EventSummary,
  ApiKeyRecord,
  ApplicationSessionRecord,
  ConsoleSessionRecord,
  ShowcaseStore
} from "../../platform/store.js";
import {
  ApplicationError,
  capacityExceeded,
  invalidCredentials,
  invalidCsrf,
  unavailableDependency
} from "../../shared/application/errors.js";
import {
  generatePrefixedSecret,
  hashOpaqueSecret,
  timingSafeBufferEqual,
  timingSafeStringEqual
} from "../../shared/crypto/opaque-secret.js";

export type ConsoleState = Readonly<{
  api_keys: readonly Readonly<{
    id: string;
    name: string;
    prefix: string;
    created_at: string;
    revoked_at?: string;
  }>[];
  events: readonly EventSummary[];
  sessions: readonly Readonly<{
    id: string;
    api_key_id: string;
    subject: string;
    created_at: string;
    expires_at: string;
    revoked_at?: string;
  }>[];
}>;

const iso = (value: Date): string => value.toISOString();

export const publicApiKeySummary = (record: ApiKeyRecord) => ({
  id: record.id,
  name: record.name,
  prefix: record.prefix,
  created_at: iso(record.createdAt),
  ...(record.revokedAt ? { revoked_at: iso(record.revokedAt) } : {})
});

export const publicSessionSummary = (record: ApplicationSessionRecord) => ({
  id: record.id,
  api_key_id: record.apiKeyId,
  subject: record.subject,
  created_at: iso(record.createdAt),
  expires_at: iso(record.expiresAt),
  ...(record.revokedAt ? { revoked_at: iso(record.revokedAt) } : {})
});

export class ConsoleService {
  public constructor(
    private readonly config: AppConfig,
    private readonly store: ShowcaseStore,
    private readonly rateLimiter: ConsoleRateLimiter
  ) {}

  public async login(
    accessCode: string,
    ip: string
  ): Promise<{ token: string; csrfToken: string }> {
    try {
      await this.rateLimiter.assertAllowed(ip);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw unavailableDependency();
    }

    if (!timingSafeStringEqual(accessCode, this.config.consoleAccessCode)) {
      try {
        await this.rateLimiter.recordFailure(ip);
      } catch (error) {
        if (error instanceof ApplicationError) throw error;
        throw unavailableDependency();
      }
      throw invalidCredentials("invalid_console_access");
    }

    try {
      await this.rateLimiter.reset(ip);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw unavailableDependency();
    }

    if ((await this.store.countConsoleSessions()) >= this.config.maxConsoleSessions) {
      throw capacityExceeded();
    }

    const token = generatePrefixedSecret("cs").value;
    const csrfToken = generatePrefixedSecret("csrf").value;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 15 * 60_000);

    await this.store.createConsoleSession({
      id: randomUUID(),
      tokenDigest: hashOpaqueSecret(token, this.config.credentialHashKey),
      csrfDigest: hashOpaqueSecret(csrfToken, this.config.credentialHashKey),
      createdAt,
      expiresAt
    }, this.config.maxConsoleSessions);

    return { token, csrfToken };
  }

  public async verifySession(
    token: string | undefined,
    origin: string | undefined,
    isMutation: boolean,
    csrfToken?: string
  ): Promise<ConsoleSessionRecord> {
    if (isMutation) {
      if (origin !== this.config.consoleOrigin) throw invalidCsrf();
    } else if (origin !== undefined && origin !== this.config.consoleOrigin) {
      throw invalidCsrf();
    }

    if (!token) throw invalidCredentials("invalid_console_session");

    const tokenDigest = hashOpaqueSecret(token, this.config.credentialHashKey);
    const session = await this.store.findConsoleSession(tokenDigest, new Date());
    if (!session) throw invalidCredentials("invalid_console_session");

    if (isMutation) {
      if (!csrfToken) throw invalidCsrf();
      const suppliedDigest = hashOpaqueSecret(csrfToken, this.config.credentialHashKey);
      if (!timingSafeBufferEqual(session.csrfDigest, suppliedDigest)) throw invalidCsrf();
    }

    return session;
  }

  public async revokeSession(sessionId: string): Promise<void> {
    await this.store.revokeConsoleSession(sessionId, new Date());
  }

  public async getState(): Promise<ConsoleState> {
    const [keys, sessions, events] = await Promise.all([
      this.store.listApiKeys(),
      this.store.listSessions(),
      this.store.listEventSummaries()
    ]);
    return {
      events,
      api_keys: keys.map(publicApiKeySummary),
      sessions: sessions.map(publicSessionSummary)
    };
  }
}
