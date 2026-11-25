import type {
  EventSummary,
  ApiKeyRecord,
  ApplicationSessionRecord,
  ShowcaseStore,
  UserSummary
} from "../../platform/store.js";

/** Upper bound on demo users listed in the console (the default MAX_DEMO_USERS cap is 100). */
export const CONSOLE_USER_LIMIT = 200;

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
  users: readonly UserSummary[];
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
  public constructor(private readonly store: ShowcaseStore) {}

  public async getState(): Promise<ConsoleState> {
    const [keys, sessions, events, users] = await Promise.all([
      this.store.listApiKeys(),
      this.store.listSessions(),
      this.store.listEventSummaries(),
      this.store.listUserSummaries(CONSOLE_USER_LIMIT)
    ]);
    return {
      events,
      users,
      api_keys: keys.map(publicApiKeySummary),
      sessions: sessions.map(publicSessionSummary)
    };
  }
}
