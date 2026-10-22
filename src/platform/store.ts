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

export type ApplicationSessionRecord = Readonly<{
  id: string;
  apiKeyId: string;
  subject: string;
  tokenDigest: Buffer;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}>;

export type ShowcaseStore = Readonly<{
  ready(): Promise<void>;
  createConsoleSession(record: ConsoleSessionRecord): Promise<void>;
  countConsoleSessions(): Promise<number>;
  findConsoleSession(tokenDigest: Buffer, now: Date): Promise<ConsoleSessionRecord | undefined>;
  revokeConsoleSession(id: string, now: Date): Promise<void>;
  createApiKey(record: ApiKeyRecord): Promise<void>;
  findApiKey(secretDigest: Buffer, now: Date): Promise<ApiKeyRecord | undefined>;
  listApiKeys(): Promise<readonly ApiKeyRecord[]>;
  revokeApiKey(id: string, now: Date): Promise<void>;
  createSession(record: ApplicationSessionRecord): Promise<void>;
  countSessions(): Promise<number>;
  findSession(apiKeyId: string, tokenDigest: Buffer, now: Date): Promise<ApplicationSessionRecord | undefined>;
  listSessions(apiKeyId?: string): Promise<readonly ApplicationSessionRecord[]>;
  revokeSession(id: string, apiKeyId: string | undefined, now: Date): Promise<boolean>;
}>;
