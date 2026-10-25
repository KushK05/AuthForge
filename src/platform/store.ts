export type ConsoleSessionRecord = Readonly<{
  id: string;
  tokenDigest: Buffer;
  csrfDigest: Buffer;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}>;

export type ApiKeyRecord = Readonly<{
  id: string;
  name: string;
  prefix: string;
  secretDigest: Buffer;
  createdAt: Date;
  revokedAt?: Date;
}>;

export type DemoUserRecord = Readonly<{
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  disabledAt?: Date;
}>;

export type DemoUserSessionRecord = Readonly<{
  id: string;
  userId: string;
  tokenDigest: Buffer;
  csrfDigest: Buffer;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}>;

export type ApplicationSessionRecord = Readonly<{
  id: string;
  apiKeyId: string;
  subject: string;
  tokenDigest: Buffer;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}>;

export type EventSummary = Readonly<{ id: string; event_type: string; created_at: string; published_at: string | null; processed_at: string | null }>;

export type ShowcaseStore = Readonly<{
  ready(): Promise<void>;
  createConsoleSession(record: ConsoleSessionRecord, limit?: number): Promise<void>;
  countConsoleSessions(): Promise<number>;
  findConsoleSession(tokenDigest: Buffer, now: Date): Promise<ConsoleSessionRecord | undefined>;
  revokeConsoleSession(id: string, now: Date): Promise<void>;
  createUser(record: DemoUserRecord): Promise<boolean>;
  findUserByEmail(email: string): Promise<DemoUserRecord | undefined>;
  findUserById(id: string): Promise<DemoUserRecord | undefined>;
  createUserSession(record: DemoUserSessionRecord, limit?: number): Promise<void>;
  findUserSession(tokenDigest: Buffer, now: Date): Promise<DemoUserSessionRecord | undefined>;
  revokeUserSession(id: string, now: Date): Promise<void>;
  createApiKey(record: ApiKeyRecord, limit?: number): Promise<void>;
  findApiKey(secretDigest: Buffer, now: Date): Promise<ApiKeyRecord | undefined>;
  listApiKeys(): Promise<readonly ApiKeyRecord[]>;
  revokeApiKey(id: string, now: Date): Promise<void>;
  createSession(record: ApplicationSessionRecord, limit?: number): Promise<void>;
  countSessions(): Promise<number>;
  findSession(apiKeyId: string, tokenDigest: Buffer, now: Date): Promise<ApplicationSessionRecord | undefined>;
  listSessions(apiKeyId?: string): Promise<readonly ApplicationSessionRecord[]>;
  revokeSession(id: string, apiKeyId: string | undefined, now: Date): Promise<boolean>;
  createUserAndSession(user: DemoUserRecord, session: DemoUserSessionRecord, maxUsers: number, maxSessions: number): Promise<boolean>;
  listEventSummaries(): Promise<readonly EventSummary[]>;
}>;
