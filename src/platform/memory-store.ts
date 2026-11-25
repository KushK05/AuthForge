import { capacityExceeded, invalidCredentials } from "../shared/application/errors.js";
import type {
  EventSummary,
  ApiKeyRecord,
  ApplicationSessionRecord,
  DemoUserRecord,
  DemoUserEmailActionRecord,
  DemoUserSessionRecord,
  ShowcaseStore,
  UserSummary
} from "./store.js";

const active = (revokedAt: Date | undefined, expiresAt: Date, now: Date): boolean =>
  revokedAt === undefined && expiresAt > now;

export class MemoryShowcaseStore implements ShowcaseStore {
  private readonly apiKeys = new Map<string, ApiKeyRecord>();
  private readonly sessions = new Map<string, ApplicationSessionRecord>();
  private readonly users = new Map<string, DemoUserRecord>();
  private readonly userSessions = new Map<string, DemoUserSessionRecord>();
  private readonly userEmailActions = new Map<string, DemoUserEmailActionRecord>();

  public async ready(): Promise<void> {}

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

  public async createPendingUser(user: DemoUserRecord, action: DemoUserEmailActionRecord, maxUsers: number): Promise<boolean> {
    if ([...this.users.values()].some(existing => existing.email === user.email)) return false;
    if (this.users.size >= maxUsers) throw capacityExceeded();
    this.users.set(user.id, user);
    this.userEmailActions.set(action.id, action);
    return true;
  }

  public async createUserEmailAction(action: DemoUserEmailActionRecord): Promise<boolean> {
    const user = this.users.get(action.userId);
    if (!user || user.disabledAt || (action.purpose === "verify_email" ? Boolean(user.emailVerifiedAt) : !user.emailVerifiedAt)) return false;
    for (const existing of this.userEmailActions.values()) {
      if (existing.userId === action.userId && existing.purpose === action.purpose && !existing.consumedAt) {
        this.userEmailActions.set(existing.id, {...existing, consumedAt: action.createdAt});
      }
    }
    this.userEmailActions.set(action.id, action);
    return true;
  }

  public async verifyUserEmail(tokenDigest: Buffer, now: Date, session: Omit<DemoUserSessionRecord, "userId">, maxSessions: number): Promise<DemoUserRecord | undefined> {
    const action = [...this.userEmailActions.values()].find(item => item.purpose === "verify_email" && !item.consumedAt && item.expiresAt > now && item.tokenDigest.equals(tokenDigest));
    if (!action) return undefined;
    const user = this.users.get(action.userId);
    if (!user || user.disabledAt) return undefined;
    if ([...this.userSessions.values()].filter(r => active(r.revokedAt, r.expiresAt, now)).length >= maxSessions) throw capacityExceeded();
    this.userEmailActions.set(action.id, {...action, consumedAt: now});
    const verified = {...user, emailVerifiedAt: now};
    this.users.set(user.id, verified);
    this.userSessions.set(session.id, {...session, userId: action.userId});
    return verified;
  }

  public async resetUserPassword(tokenDigest: Buffer, passwordHash: string, now: Date): Promise<boolean> {
    const action = [...this.userEmailActions.values()].find(item => item.purpose === "reset_password" && !item.consumedAt && item.expiresAt > now && item.tokenDigest.equals(tokenDigest));
    if (!action) return false;
    const user = this.users.get(action.userId);
    if (!user || user.disabledAt || !user.emailVerifiedAt) return false;
    this.userEmailActions.set(action.id, {...action, consumedAt: now});
    this.users.set(user.id, {...user, passwordHash});
    for (const session of this.userSessions.values()) {
      if (session.userId === user.id && !session.revokedAt) this.userSessions.set(session.id, {...session, revokedAt: now});
    }
    return true;
  }

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

  public async listEventSummaries(): Promise<readonly EventSummary[]> { return []; }
  public async listUserSummaries(limit: number): Promise<readonly UserSummary[]> {
    return [...this.users.values()]
      .filter(user => user.disabledAt === undefined)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit)
      .map(user => ({ id: user.id, email: user.email, email_verified: user.emailVerifiedAt !== undefined, created_at: user.createdAt.toISOString() }));
  }
}
