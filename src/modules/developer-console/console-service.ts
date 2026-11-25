import type {
  EventSummary,
  ApiKeyRecord,
  ApplicationSessionRecord,
  ShowcaseStore
} from "../../platform/store.js";

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
  public constructor(private readonly store: ShowcaseStore) {}

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
