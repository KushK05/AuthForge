# Temporary data model

## Storage and retention rule

Amazon RDS for PostgreSQL is authoritative only while the temporary showcase environment exists. Every record must be synthetic. Terraform teardown deletes the database without a final snapshot, and no backup or export may retain application data after evaluation.

Redis and S3 are part of the AWS evaluation but are not alternate authorities. Redis is disposable. S3 receives only redacted synthetic event artifacts and is emptied during teardown.

## PostgreSQL tables

| Table | Key fields and constraints |
| --- | --- |
| `showcase_console_sessions` | `id`, `token_digest`, `csrf_digest`, `created_at`, `expires_at`, `revoked_at`; no developer identity fields. |
| `showcase_api_keys` | `id`, `name`, `prefix`, `secret_digest`, `created_at`, `revoked_at`; unique digest and non-secret prefix. |
| `showcase_users` | `id`, normalized approved demo email, Argon2id password hash, `created_at`, `disabled_at`; no profile fields. |
| `showcase_user_sessions` | `id`, `user_id`, token and CSRF digests, `created_at`, `expires_at`, `revoked_at`; browser-authentication session. |
| `showcase_sessions` | `id`, `api_key_id`, `subject`, `token_digest`, `created_at`, `expires_at`, `revoked_at`; unique digest and indexed ownership. |
| `showcase_outbox_events` | `id`, `event_type`, `event_version`, redacted JSON payload, `created_at`, `published_at`, `discarded_at`. |
| `showcase_worker_inbox` | Unique `(event_id, consumer_name)` completion records that prevent duplicate worker side effects after successful processing. |

Do not add organizations, projects, environments, roles, permissions, refresh tokens, profile fields, or durable audit tables. User records are limited to approved demo identities and exist only until teardown.

## Sensitive-field rules

- API-key, session-token, console-cookie, user-session cookie, and CSRF values use cryptographically secure randomness.
- Passwords are stored only as Argon2id hashes. User email is restricted to the `@authforge.demo` demonstration domain.
- PostgreSQL stores only keyed digests of raw credential values.
- Prefixes and names are display metadata and must not contain real secrets or personal data.
- The raw API key and session token appear only in their creation response.
- The console access code and digest key live in Secrets Manager and are encrypted with KMS.

## Invariants

1. Every application session belongs to exactly one API key.
2. Revoking an API key revokes all sessions owned by it in the same transaction.
3. Expired or revoked credentials never authenticate.
4. Other API keys cannot discover or revoke a session they do not own.
5. Every mutation and its outbox event commit together.
6. SQS, S3, SES, logs, metrics, and traces never receive raw credentials or subjects.
7. All application records are deleted with the temporary environment.

## Redis records

Redis may contain only:

- Console access-code attempt counters with short TTLs.
- Short-lived API-key and session-validation cache entries.
- Revocation hints bounded by credential expiry.

Redis loss must not grant access. Cache misses resolve through PostgreSQL. If the login-rate limiter is unavailable, console login fails closed with `503 dependency_unavailable`.

## S3 event artifacts

Each worker artifact may contain event ID, event type, event version, timestamp, API-key ID, session ID, correlation ID, processing result, and synthetic marker. It must not contain `subject`, raw payload bodies, secrets, email addresses, or authorization data.

Use a short lifecycle expiration as defense in depth. Terraform teardown must empty and delete the bucket even if lifecycle expiration has not run.

## Migration rules

Migrations are forward-only and reviewable. They run before the API and worker tasks start. Because the environment is disposable, rollback means destroying and recreating the stack rather than preserving incompatible demo data.

## Implementation notes

Historical migrations are immutable. Migration `0013_restore_showcase_contract` removes the superseded `previous_token_digest` column and adds a positive user-session lifetime constraint. The complete migration chain ends with the seven showcase tables plus the migration ledger; the old product tables are dropped by migration 0009.

Registration inserts the demo user and initial browser session in one transaction. Creation limits use a transaction-scoped advisory lock so concurrent requests cannot exceed the configured showcase capacity. Session creation and key revocation use the same lock and validate key status inside the transaction.

Hosted CSRF values are derived with a domain-separated HMAC from the random browser cookie and credential hash key. Only their digests are stored; `/auth/me` can reproduce the proof without storing raw secrets.

Redis validation hints contain only a synthetic session ID; neither subjects nor hosted user details are cached. Hints expire within 30 seconds and never replace PostgreSQL checks.

Migration `0014_outbox_discarded_events` marks unpublished legacy refresh/replay events as discarded and excludes discarded rows from pending publication. Invalid envelopes are also discarded locally by the worker, without being sent to AWS or marked published. Transport failures remain pending for retry. Discarded records are temporary and deleted with the database at teardown.
