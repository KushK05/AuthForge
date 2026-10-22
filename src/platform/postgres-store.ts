import { randomUUID } from "node:crypto";

import type postgres from "postgres";

import type {
  ApiKeyRecord,
  ApplicationSessionRecord,
  ConsoleSessionRecord,
  ShowcaseStore
} from "./store.js";

type ConsoleSessionRow = Readonly<{
  id: string;
  token_digest: Buffer;
  csrf_digest: Buffer;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}>;

type ApiKeyRow = Readonly<{
  id: string;
  name: string;
  prefix: string;
  secret_digest: Buffer;
  created_at: Date;
  revoked_at: Date | null;
}>;

type SessionRow = Readonly<{
  id: string;
  api_key_id: string;
  subject: string;
  token_digest: Buffer;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}>;

const toConsoleSession = (row: ConsoleSessionRow): ConsoleSessionRecord => ({
  id: row.id,
  tokenDigest: row.token_digest,
  csrfDigest: row.csrf_digest,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  ...(row.revoked_at ? { revokedAt: row.revoked_at } : {})
});

const toApiKey = (row: ApiKeyRow): ApiKeyRecord => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  secretDigest: row.secret_digest,
  createdAt: row.created_at,
  ...(row.revoked_at ? { revokedAt: row.revoked_at } : {})
});

const toSession = (row: SessionRow): ApplicationSessionRecord => ({
  id: row.id,
  apiKeyId: row.api_key_id,
  subject: row.subject,
  tokenDigest: row.token_digest,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  ...(row.revoked_at ? { revokedAt: row.revoked_at } : {})
});

export class PostgresShowcaseStore implements ShowcaseStore {
  public constructor(private readonly sql: postgres.Sql) {}

  public async ready(): Promise<void> {
    await this.sql`SELECT 1`;
  }

  public async createConsoleSession(record: ConsoleSessionRecord): Promise<void> {
    await this.sql`
      INSERT INTO showcase_console_sessions
        (id, token_digest, csrf_digest, created_at, expires_at)
      VALUES
        (${record.id}, ${record.tokenDigest}, ${record.csrfDigest}, ${record.createdAt}, ${record.expiresAt})
    `;
  }

  public async countConsoleSessions(): Promise<number> {
    const [row] = await this.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM showcase_console_sessions
      WHERE revoked_at IS NULL AND expires_at > now()
    `;
    return row?.count ?? 0;
  }

  public async findConsoleSession(tokenDigest: Buffer, now: Date): Promise<ConsoleSessionRecord | undefined> {
    const [row] = await this.sql<ConsoleSessionRow[]>`
      SELECT id, token_digest, csrf_digest, created_at, expires_at, revoked_at
      FROM showcase_console_sessions
      WHERE token_digest = ${tokenDigest} AND revoked_at IS NULL AND expires_at > ${now}
      LIMIT 1
    `;
    return row ? toConsoleSession(row) : undefined;
  }

  public async revokeConsoleSession(id: string, now: Date): Promise<void> {
    await this.sql`
      UPDATE showcase_console_sessions SET revoked_at = ${now}
      WHERE id = ${id} AND revoked_at IS NULL
    `;
  }

  public async createApiKey(record: ApiKeyRecord): Promise<void> {
    await this.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO showcase_api_keys
          (id, name, prefix, secret_digest, created_at)
        VALUES
          (${record.id}, ${record.name}, ${record.prefix}, ${record.secretDigest}, ${record.createdAt})
      `;
      await transaction`
        INSERT INTO showcase_outbox_events
          (id, event_type, event_version, payload, created_at)
        VALUES
          (${randomUUID()}, 'showcase.api_key.created', 1,
           ${transaction.json({ api_key_id: record.id })}, ${record.createdAt})
      `;
    });
  }

  public async findApiKey(secretDigest: Buffer, now: Date): Promise<ApiKeyRecord | undefined> {
    const [row] = await this.sql<ApiKeyRow[]>`
      SELECT id, name, prefix, secret_digest, created_at, revoked_at
      FROM showcase_api_keys
      WHERE secret_digest = ${secretDigest} AND revoked_at IS NULL AND created_at <= ${now}
      LIMIT 1
    `;
    return row ? toApiKey(row) : undefined;
  }

  public async listApiKeys(): Promise<readonly ApiKeyRecord[]> {
    const rows = await this.sql<ApiKeyRow[]>`
      SELECT id, name, prefix, secret_digest, created_at, revoked_at
      FROM showcase_api_keys ORDER BY created_at DESC
    `;
    return rows.map(toApiKey);
  }

  public async revokeApiKey(id: string, now: Date): Promise<void> {
    await this.sql.begin(async (transaction) => {
      await transaction`
        UPDATE showcase_api_keys SET revoked_at = COALESCE(revoked_at, ${now})
        WHERE id = ${id}
      `;
      await transaction`
        UPDATE showcase_sessions SET revoked_at = COALESCE(revoked_at, ${now})
        WHERE api_key_id = ${id}
      `;
      await transaction`
        INSERT INTO showcase_outbox_events
          (id, event_type, event_version, payload, created_at)
        VALUES
          (${randomUUID()}, 'showcase.api_key.revoked', 1,
           ${transaction.json({ api_key_id: id })}, ${now})
      `;
    });
  }

  public async createSession(record: ApplicationSessionRecord): Promise<void> {
    await this.sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO showcase_sessions
          (id, api_key_id, subject, token_digest, created_at, expires_at)
        VALUES
          (${record.id}, ${record.apiKeyId}, ${record.subject}, ${record.tokenDigest}, ${record.createdAt}, ${record.expiresAt})
      `;
      await transaction`
        INSERT INTO showcase_outbox_events
          (id, event_type, event_version, payload, created_at)
        VALUES
          (${record.id}, 'showcase.session.created', 1,
           ${transaction.json({ session_id: record.id, api_key_id: record.apiKeyId })}, ${record.createdAt})
      `;
    });
  }

  public async countSessions(): Promise<number> {
    const [row] = await this.sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM showcase_sessions
      WHERE revoked_at IS NULL AND expires_at > now()
    `;
    return row?.count ?? 0;
  }

  public async findSession(apiKeyId: string, tokenDigest: Buffer, now: Date): Promise<ApplicationSessionRecord | undefined> {
    const [row] = await this.sql<SessionRow[]>`
      SELECT id, api_key_id, subject, token_digest, created_at, expires_at, revoked_at
      FROM showcase_sessions
      WHERE api_key_id = ${apiKeyId} AND token_digest = ${tokenDigest}
        AND revoked_at IS NULL AND expires_at > ${now}
      LIMIT 1
    `;
    return row ? toSession(row) : undefined;
  }

  public async listSessions(apiKeyId?: string): Promise<readonly ApplicationSessionRecord[]> {
    const rows = apiKeyId === undefined
      ? await this.sql<SessionRow[]>`
          SELECT id, api_key_id, subject, token_digest, created_at, expires_at, revoked_at
          FROM showcase_sessions ORDER BY created_at DESC
        `
      : await this.sql<SessionRow[]>`
          SELECT id, api_key_id, subject, token_digest, created_at, expires_at, revoked_at
          FROM showcase_sessions WHERE api_key_id = ${apiKeyId} ORDER BY created_at DESC
        `;
    return rows.map(toSession);
  }

  public async revokeSession(id: string, apiKeyId: string | undefined, now: Date): Promise<boolean> {
    return this.sql.begin(async (transaction) => {
      const result = apiKeyId === undefined
        ? await transaction`UPDATE showcase_sessions SET revoked_at = COALESCE(revoked_at, ${now}) WHERE id = ${id}`
        : await transaction`UPDATE showcase_sessions SET revoked_at = COALESCE(revoked_at, ${now}) WHERE id = ${id} AND api_key_id = ${apiKeyId}`;
      if (result.count > 0) {
        await transaction`
          INSERT INTO showcase_outbox_events
            (id, event_type, event_version, payload, created_at)
          VALUES
            (${randomUUID()}, 'showcase.session.revoked', 1,
             ${transaction.json({ session_id: id, ...(apiKeyId ? { api_key_id: apiKeyId } : {}) })}, ${now})
        `;
      }
      return result.count > 0;
    }) as Promise<boolean>;
  }
}
