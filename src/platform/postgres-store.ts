import { capacityExceeded, invalidCredentials } from "../shared/application/errors.js";
import { randomUUID } from "node:crypto";

import type postgres from "postgres";

import type {
  EventSummary,
  ApiKeyRecord,
  ApplicationSessionRecord,
  ConsoleSessionRecord,
  DemoUserRecord,
  DemoUserEmailActionRecord,
  DemoUserSessionRecord,
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
type UserRow = Readonly<{ id: string; email: string; password_hash: string; created_at: Date; email_verified_at: Date | null; disabled_at: Date | null }>;
type UserEmailActionRow = Readonly<{ id: string; user_id: string; purpose: "verify_email" | "reset_password"; token_digest: Buffer; created_at: Date; expires_at: Date; consumed_at: Date | null }>;
type UserSessionRow = Readonly<{ id: string; user_id: string; token_digest: Buffer; csrf_digest: Buffer; created_at: Date; expires_at: Date; revoked_at: Date | null }>;

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
const toUser = (row: UserRow): DemoUserRecord => ({ id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at, ...(row.email_verified_at ? { emailVerifiedAt: row.email_verified_at } : {}), ...(row.disabled_at ? { disabledAt: row.disabled_at } : {}) });
const toUserSession = (row: UserSessionRow): DemoUserSessionRecord => ({ id: row.id, userId: row.user_id, tokenDigest: row.token_digest, csrfDigest: row.csrf_digest, createdAt: row.created_at, expiresAt: row.expires_at, ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}) });

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

  public async createConsoleSession(record: ConsoleSessionRecord, limit = 20): Promise<void> {
    await this.sql.begin(async transaction => {
      await transaction`SELECT pg_advisory_xact_lock(824031421)`;
      const [count] = await transaction<{count: number}[]>`SELECT count(*)::int AS count FROM showcase_console_sessions WHERE revoked_at IS NULL AND expires_at > now()`;
      if ((count?.count ?? 0) >= limit) throw capacityExceeded();
      await transaction`
      INSERT INTO showcase_console_sessions
        (id, token_digest, csrf_digest, created_at, expires_at)
      VALUES
        (${record.id}, ${record.tokenDigest}, ${record.csrfDigest}, ${record.createdAt}, ${record.expiresAt})
      `;
    });
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

  public async findUserByEmail(email: string): Promise<DemoUserRecord | undefined> {
    const [row] = await this.sql<UserRow[]>`SELECT id, email, password_hash, created_at, email_verified_at, disabled_at FROM showcase_users WHERE email = ${email} AND disabled_at IS NULL LIMIT 1`;
    return row ? toUser(row) : undefined;
  }
  public async findUserById(id: string): Promise<DemoUserRecord | undefined> {
    const [row] = await this.sql<UserRow[]>`SELECT id, email, password_hash, created_at, email_verified_at, disabled_at FROM showcase_users WHERE id = ${id} AND disabled_at IS NULL LIMIT 1`;
    return row ? toUser(row) : undefined;
  }
  public async createUserSession(record: DemoUserSessionRecord, limit = 100): Promise<void> {
    await this.sql.begin(async transaction => {
      await transaction`SELECT pg_advisory_xact_lock(824031421)`;
      const [count] = await transaction<{count: number}[]>`SELECT count(*)::int AS count FROM showcase_user_sessions WHERE revoked_at IS NULL AND expires_at > now()`;
      if ((count?.count ?? 0) >= limit) throw capacityExceeded();
      await transaction`INSERT INTO showcase_user_sessions (id, user_id, token_digest, csrf_digest, created_at, expires_at) VALUES (${record.id}, ${record.userId}, ${record.tokenDigest}, ${record.csrfDigest}, ${record.createdAt}, ${record.expiresAt})`;
    });
  }
  public async findUserSession(tokenDigest: Buffer, now: Date): Promise<DemoUserSessionRecord | undefined> {
    const [row] = await this.sql<UserSessionRow[]>`SELECT id, user_id, token_digest, csrf_digest, created_at, expires_at, revoked_at FROM showcase_user_sessions WHERE token_digest = ${tokenDigest} AND revoked_at IS NULL AND expires_at > ${now} LIMIT 1`;
    return row ? toUserSession(row) : undefined;
  }
  public async revokeUserSession(id: string, now: Date): Promise<void> { await this.sql`UPDATE showcase_user_sessions SET revoked_at = ${now} WHERE id = ${id} AND revoked_at IS NULL`; }

  public async createPendingUser(user: DemoUserRecord, action: DemoUserEmailActionRecord, maxUsers: number): Promise<boolean> {
    return this.sql.begin(async transaction => {
      await transaction`SELECT pg_advisory_xact_lock(824031421)`;
      const [existing] = await transaction`SELECT id FROM showcase_users WHERE email = ${user.email}`;
      if (existing) return false;
      const [users] = await transaction<{count: number}[]>`SELECT count(*)::int AS count FROM showcase_users`;
      if ((users?.count ?? 0) >= maxUsers) throw capacityExceeded();
      await transaction`INSERT INTO showcase_users (id, email, password_hash, created_at) VALUES (${user.id}, ${user.email}, ${user.passwordHash}, ${user.createdAt})`;
      await transaction`INSERT INTO showcase_user_email_actions (id, user_id, purpose, token_digest, created_at, expires_at)
        VALUES (${action.id}, ${action.userId}, ${action.purpose}, ${action.tokenDigest}, ${action.createdAt}, ${action.expiresAt})`;
      return true;
    }) as Promise<boolean>;
  }

  public async createUserEmailAction(action: DemoUserEmailActionRecord): Promise<boolean> {
    return this.sql.begin(async transaction => {
      await transaction`SELECT pg_advisory_xact_lock(824031421)`;
      const rows = action.purpose === "verify_email"
        ? await transaction<UserRow[]>`SELECT id, email, password_hash, created_at, email_verified_at, disabled_at
            FROM showcase_users WHERE id = ${action.userId} AND disabled_at IS NULL AND email_verified_at IS NULL FOR UPDATE`
        : await transaction<UserRow[]>`SELECT id, email, password_hash, created_at, email_verified_at, disabled_at
            FROM showcase_users WHERE id = ${action.userId} AND disabled_at IS NULL AND email_verified_at IS NOT NULL FOR UPDATE`;
      const [user] = rows;
      if (!user) return false;
      await transaction`UPDATE showcase_user_email_actions SET consumed_at = ${action.createdAt}
        WHERE user_id = ${action.userId} AND purpose = ${action.purpose} AND consumed_at IS NULL`;
      await transaction`INSERT INTO showcase_user_email_actions (id, user_id, purpose, token_digest, created_at, expires_at)
        VALUES (${action.id}, ${action.userId}, ${action.purpose}, ${action.tokenDigest}, ${action.createdAt}, ${action.expiresAt})`;
      return true;
    }) as Promise<boolean>;
  }

  public async verifyUserEmail(tokenDigest: Buffer, now: Date, session: Omit<DemoUserSessionRecord, "userId">, maxSessions: number): Promise<DemoUserRecord | undefined> {
    return this.sql.begin(async transaction => {
      await transaction`SELECT pg_advisory_xact_lock(824031421)`;
      const [action] = await transaction<UserEmailActionRow[]>`SELECT id, user_id, purpose, token_digest, created_at, expires_at, consumed_at
        FROM showcase_user_email_actions WHERE purpose = 'verify_email' AND token_digest = ${tokenDigest}
          AND consumed_at IS NULL AND expires_at > ${now} FOR UPDATE`;
      if (!action) return undefined;
      const [user] = await transaction<UserRow[]>`SELECT id, email, password_hash, created_at, email_verified_at, disabled_at
        FROM showcase_users WHERE id = ${action.user_id} AND disabled_at IS NULL FOR UPDATE`;
      if (!user || user.email_verified_at) return undefined;
      const [count] = await transaction<{count: number}[]>`SELECT count(*)::int AS count FROM showcase_user_sessions WHERE revoked_at IS NULL AND expires_at > ${now}`;
      if ((count?.count ?? 0) >= maxSessions) throw capacityExceeded();
      await transaction`UPDATE showcase_user_email_actions SET consumed_at = ${now} WHERE id = ${action.id}`;
      await transaction`UPDATE showcase_users SET email_verified_at = ${now} WHERE id = ${user.id}`;
      await transaction`INSERT INTO showcase_user_sessions (id, user_id, token_digest, csrf_digest, created_at, expires_at)
        VALUES (${session.id}, ${action.user_id}, ${session.tokenDigest}, ${session.csrfDigest}, ${session.createdAt}, ${session.expiresAt})`;
      return {...toUser(user), emailVerifiedAt: now};
    }) as Promise<DemoUserRecord | undefined>;
  }

  public async resetUserPassword(tokenDigest: Buffer, passwordHash: string, now: Date): Promise<boolean> {
    return this.sql.begin(async transaction => {
      await transaction`SELECT pg_advisory_xact_lock(824031421)`;
      const [action] = await transaction<UserEmailActionRow[]>`SELECT id, user_id, purpose, token_digest, created_at, expires_at, consumed_at
        FROM showcase_user_email_actions WHERE purpose = 'reset_password' AND token_digest = ${tokenDigest}
          AND consumed_at IS NULL AND expires_at > ${now} FOR UPDATE`;
      if (!action) return false;
      const [user] = await transaction`SELECT id FROM showcase_users WHERE id = ${action.user_id} AND email_verified_at IS NOT NULL AND disabled_at IS NULL FOR UPDATE`;
      if (!user) return false;
      await transaction`UPDATE showcase_user_email_actions SET consumed_at = ${now} WHERE id = ${action.id}`;
      await transaction`UPDATE showcase_users SET password_hash = ${passwordHash} WHERE id = ${action.user_id}`;
      await transaction`UPDATE showcase_user_sessions SET revoked_at = ${now} WHERE user_id = ${action.user_id} AND revoked_at IS NULL`;
      return true;
    }) as Promise<boolean>;
  }

  public async createApiKey(record: ApiKeyRecord, limit = 100): Promise<void> {
    await this.sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(824031421)`;
      const [count] = await transaction<{count: number}[]>`SELECT count(*)::int AS count FROM showcase_api_keys`;
      if ((count?.count ?? 0) >= limit) throw capacityExceeded();
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
    await this.sql.begin(async transaction => {
      await transaction`SELECT pg_advisory_xact_lock(824031421)`;
      const changed = await transaction`UPDATE showcase_api_keys SET revoked_at = ${now} WHERE id = ${id} AND revoked_at IS NULL RETURNING id`;
      if (!changed.count) return;
      await transaction`UPDATE showcase_sessions SET revoked_at = ${now} WHERE api_key_id = ${id} AND revoked_at IS NULL`;
      await transaction`INSERT INTO showcase_outbox_events (id, event_type, event_version, payload, created_at)
        VALUES (${randomUUID()}, 'showcase.api_key.revoked', 1, ${transaction.json({api_key_id: id})}, ${now})`;
    });
  }

  public async createSession(record: ApplicationSessionRecord, limit = 1000): Promise<void> {
    await this.sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(824031421)`;
      const [owner] = await transaction`SELECT id FROM showcase_api_keys WHERE id = ${record.apiKeyId} AND revoked_at IS NULL FOR UPDATE`;
      if (!owner) throw invalidCredentials("invalid_api_key");
      const [count] = await transaction<{count: number}[]>`SELECT count(*)::int AS count FROM showcase_sessions WHERE revoked_at IS NULL AND expires_at > now()`;
      if ((count?.count ?? 0) >= limit) throw capacityExceeded();
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
        AND EXISTS (SELECT 1 FROM showcase_api_keys k WHERE k.id = ${apiKeyId} AND k.revoked_at IS NULL)
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
    return this.sql.begin(async transaction => {
      const [session] = apiKeyId === undefined
        ? await transaction<SessionRow[]>`SELECT * FROM showcase_sessions WHERE id = ${id} FOR UPDATE`
        : await transaction<SessionRow[]>`SELECT * FROM showcase_sessions WHERE id = ${id} AND api_key_id = ${apiKeyId} FOR UPDATE`;
      if (!session) return false;
      if (!session.revoked_at) {
        await transaction`UPDATE showcase_sessions SET revoked_at = ${now} WHERE id = ${id}`;
        await transaction`INSERT INTO showcase_outbox_events (id, event_type, event_version, payload, created_at)
          VALUES (${randomUUID()}, 'showcase.session.revoked', 1, ${transaction.json({session_id: id, api_key_id: session.api_key_id})}, ${now})`;
      }
      return true;
    }) as Promise<boolean>;
  }

  public async listEventSummaries(): Promise<readonly EventSummary[]> {
    const rows = await this.sql<{id: string; event_type: string; created_at: Date; published_at: Date | null; processed_at: Date | null}[]>`
      SELECT e.id, e.event_type, e.created_at, e.published_at, i.processed_at
      FROM showcase_outbox_events e LEFT JOIN showcase_worker_inbox i ON i.event_id = e.id
      ORDER BY e.created_at DESC LIMIT 50`;
    return rows.map(row => ({...row, created_at: row.created_at.toISOString(), published_at: row.published_at?.toISOString() ?? null, processed_at: row.processed_at?.toISOString() ?? null}));
  }
}
