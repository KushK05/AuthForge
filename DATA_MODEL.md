# Data model

## Ownership and tenancy

PostgreSQL is the durable source of truth. Use UUID primary keys, `created_at`, `updated_at`, and UTC `timestamptz`. Business tables that belong to an application tenant include non-null `project_id` indexed as the leading column for common access paths. Foreign keys enforce same-project ownership either directly or through composite unique keys such as `(id, project_id)`.

Use a restricted database role at runtime. Migrations use a separate role. Application code does not issue cross-project reporting queries. Consider PostgreSQL row-level security only after application-level predicates and test coverage are proven; it is defense in depth, not a substitute for correct queries.

## Core tables

| Table | Owner | Key fields and constraints |
| --- | --- | --- |
| `developer_organizations` | developer-platform | `id`, `name`; platform owner boundary. |
| `developer_memberships` | developer-platform | `(organization_id, developer_user_id)` unique; console role. |
| `projects` | developer-platform | `id`, `organization_id`, `name`, `status`; project is tenant boundary. |
| `project_environments` | developer-platform | `id`, `project_id`, `name`, `issuer`, `audience`; unique `(project_id,name)`. |
| `api_keys` | developer-platform | `id`, `project_id`, `environment_id`, `kind`, `secret_hash`, `prefix`, `scopes`, `revoked_at`, `expires_at`; unique hash and non-secret prefix only. |
| `redirect_urls` | developer-platform | `id`, `project_id`, `url`, `kind`; normalized URL unique per project. |
| `users` | identity | `id`, `project_id`, `primary_email_normalized`, `password_hash`, `email_verified_at`, `status`, `token_version`; unique `(project_id,primary_email_normalized)`. |
| `verification_tokens` | identity | `id`, `user_id`, `project_id`, `token_hash`, `expires_at`, `consumed_at`; only one active token per purpose/user enforced by partial unique index. |
| `password_reset_tokens` | identity | Same opaque-token pattern; consume once and expire quickly. |
| `sessions` | sessions | `id`, `project_id`, `user_id`, `created_at`, `last_seen_at`, `revoked_at`, `revoke_reason`, device metadata minimized. |
| `refresh_token_families` | sessions | `id`, `project_id`, `user_id`, `session_id`, `revoked_at`, `replay_detected_at`. |
| `refresh_tokens` | sessions | `id`, `family_id`, `token_hash`, `expires_at`, `consumed_at`, `replaced_by_id`; hash unique. |
| `roles` | authorization | `id`, `project_id`, `name`, `description`; unique `(project_id,name)`. |
| `permissions` | authorization | `id`, `code`; platform-controlled permission vocabulary. |
| `role_permissions` | authorization | unique `(role_id,permission_id)`. |
| `user_roles` | authorization | `project_id`, `user_id`, `role_id`; uniqueness prevents duplicate grants. |
| `audit_events` | audit | append-only: `id`, `project_id`, `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `occurred_at`, redacted metadata, correlation ID. |
| `outbox_events` | notifications/shared | `id`, `event_type`, `event_version`, payload reference, `occurred_at`, `published_at`, lease fields. |
| `consumer_inbox` | notifications/shared | unique `event_id` per consumer; supports at-least-once deduplication. |
| `idempotency_records` | shared | scoped key, request hash, response status/body reference, expiration; unique scope/key. |

## Sensitive data rules

Passwords use Argon2id and are never decryptable. Opaque tokens and secret keys use a keyed server-side hash before storage. Normalize email addresses conservatively for matching, preserve the original display address only when necessary, and encrypt any sensitive profile fields at rest using application envelope encryption backed by KMS. Do not put raw tokens in `audit_events` or `outbox_events`.

## Indexes and retention

Create indexes for `users(project_id, primary_email_normalized)`, active sessions by `(project_id, user_id, revoked_at)`, active refresh tokens by hash, audit scan by `(project_id, occurred_at DESC)`, unprocessed outbox rows, and idempotency expiry. Partition audit events by month only when observed volume justifies it. Expire consumed verification/reset tokens, idempotency records, and refresh tokens after their defined retention period via scheduled job. Retain audit records online for 90 days in v1 then archive encrypted immutable objects to S3 according to `SECURITY.md`.

## Migration rules

Migrations are immutable after merge, forward-only, and run automatically once per deployment before application rollout. Use expand-migrate-contract: add compatible schema, deploy code that supports both forms, backfill with a throttled resumable job, then remove old schema in a later release. Every migration has a rollback posture, lock-impact assessment, and a test against a production-like dataset size.
