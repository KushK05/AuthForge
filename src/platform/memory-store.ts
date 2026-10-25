import { capacityExceeded, invalidCredentials } from "../shared/application/errors.js";
import type {
  EventSummary,
  ApiKeyRecord,
  ApplicationSessionRecord,
  ConsoleSessionRecord,
  DemoUserRecord,
  DemoUserSessionRecord,
  ShowcaseStore
} from "./store.js";

const active = (revokedAt: Date | undefined, expiresAt: Date, now: Date): boolean =>
  revokedAt === undefined && expiresAt > now;

export class MemoryShowcaseStore implements ShowcaseStore {
  private readonly consoleSessions = new Map<string, ConsoleSessionRecord>();
  private readonly apiKeys = new Map<string, ApiKeyRecord>();
  private readonly sessions = new Map<string, ApplicationSessionRecord>();
  private readonly users = new Map<string, DemoUserRecord>();
  private readonly userSessions = new Map<string, DemoUserSessionRecord>();

  public async ready(): Promise<void> {}

  public async createConsoleSession(record: ConsoleSessionRecord, limit = 20): Promise<void> {
    if ([...this.consoleSessions.values()].filter(r => active(r.revokedAt, r.expiresAt, new Date())).length >= limit) throw capacityExceeded();
    this.consoleSessions.set(record.id, record);
  }

  public async countConsoleSessions(): Promise<number> {
    return [...this.consoleSessions.values()].filter(r => active(r.revokedAt, r.expiresAt, new Date())).length;
  }

  public async findConsoleSession(tokenDigest: Buffer, now: Date): Promise<ConsoleSessionRecord | undefined> {
    return [...this.consoleSessions.values()].find(
      (record) => active(record.revokedAt, record.expiresAt, now) && record.tokenDigest.equals(tokenDigest)
    );
  }

  public async revokeConsoleSession(id: string, now: Date): Promise<void> {
    const record = this.consoleSessions.get(id);
    if (record && record.revokedAt === undefined) this.consoleSessions.set(id, { ...record, revokedAt: now });
  }

  public async createUser(record: DemoUserRecord): Promise<boolean> {
    if ([...this.users.values()].some((user) => user.email === record.email)) return false;
    this.users.set(record.id, record); return true;
  }
  public async findUserByEmail(email: string): Promise<DemoUserRecord | undefined> {
    return [...this.users.values()].find((user) => user.email === email && user.disabledAt === undefined);
  }
  public async findUserById(id: string): Promise<DemoUserRecord | undefined> { const user = this.users.get(id); return user?.disabledAt ? undefined : user; }
  public async createUserSession(record: DemoUserSessionRecord, limit = 100): Promise<void> {
    if ([...this.userSessions.values()].filter(r => active(r.revokedAt, r.expiresAt, new Date())).length >= limit) throw capacityExceeded();
    this.userSessions.set(record.id, record);
  }
  public async findUserSession(tokenDigest: Buffer, now: Date): Promise<DemoUserSessionRecord | undefined> {
    return [...this.userSessions.values()].find((record) => active(record.revokedAt, record.expiresAt, now) && record.tokenDigest.equals(tokenDigest));
  }
  public async revokeUserSession(id: string, now: Date): Promise<void> { const record = this.userSessions.get(id); if (record && !record.revokedAt) this.userSessions.set(id, { ...record, revokedAt: now }); }

  public async createApiKey(record: ApiKeyRecord, limit = 100): Promise<void> {
    if (this.apiKeys.size >= limit) throw capacityExceeded();
    this.apiKeys.set(record.id, record);
  }

  public async findApiKey(secretDigest: Buffer, now: Date): Promise<ApiKeyRecord | undefined> {
    return [...this.apiKeys.values()].find(
      (record) => record.revokedAt === undefined && record.secretDigest.equals(secretDigest) && record.createdAt <= now
    );
  }

  public async listApiKeys(): Promise<readonly ApiKeyRecord[]> {
    return [...this.apiKeys.values()].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  public async revokeApiKey(id: string, now: Date): Promise<void> {
    const record = this.apiKeys.get(id);
    if (record && record.revokedAt === undefined) this.apiKeys.set(id, { ...record, revokedAt: now });
    for (const session of this.sessions.values()) {
      if (session.apiKeyId === id && session.revokedAt === undefined) {
        this.sessions.set(session.id, { ...session, revokedAt: now });
      }
    }
  }

  public async createSession(record: ApplicationSessionRecord, limit = 1000): Promise<void> {
    if ([...this.sessions.values()].filter(r => active(r.revokedAt, r.expiresAt, new Date())).length >= limit) throw capacityExceeded();
    const owner = this.apiKeys.get(record.apiKeyId);
    if (!owner || owner.revokedAt) throw invalidCredentials("invalid_api_key");
    this.sessions.set(record.id, record);
  }

  public async countSessions(): Promise<number> {
    return [...this.sessions.values()].filter(r => active(r.revokedAt, r.expiresAt, new Date())).length;
  }

  public async findSession(apiKeyId: string, tokenDigest: Buffer, now: Date): Promise<ApplicationSessionRecord | undefined> {
    return [...this.sessions.values()].find(
      (record) =>
        record.apiKeyId === apiKeyId && this.apiKeys.get(apiKeyId)?.revokedAt === undefined &&
        active(record.revokedAt, record.expiresAt, now) &&
        record.tokenDigest.equals(tokenDigest)
    );
  }

  public async listSessions(apiKeyId?: string): Promise<readonly ApplicationSessionRecord[]> {
    return [...this.sessions.values()]
      .filter((record) => apiKeyId === undefined || record.apiKeyId === apiKeyId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  public async revokeSession(id: string, apiKeyId: string | undefined, now: Date): Promise<boolean> {
    const record = this.sessions.get(id);
    if (!record || (apiKeyId !== undefined && record.apiKeyId !== apiKeyId)) return false;
    if (record.revokedAt === undefined) this.sessions.set(id, { ...record, revokedAt: now });
    return true;
  }

  public async createUserAndSession(user: DemoUserRecord, session: DemoUserSessionRecord, maxUsers: number, maxSessions: number): Promise<boolean> {
    if ([...this.users.values()].some(u => u.email === user.email)) return false;
    if (this.users.size >= maxUsers || [...this.userSessions.values()].filter(r => active(r.revokedAt, r.expiresAt, new Date())).length >= maxSessions) throw capacityExceeded();
    this.users.set(user.id, user);
    this.userSessions.set(session.id, session);
    return true;
  }
  public async listEventSummaries(): Promise<readonly EventSummary[]> { return []; }
}
