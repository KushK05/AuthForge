# API contracts

## Conventions

The base path is `/v1`. JSON uses `application/json`, timestamps use ISO-8601 UTC, and IDs are opaque strings. Every response includes `X-Request-Id`. Responses containing raw secrets include `Cache-Control: no-store`.

There are three credentials:

- Secret API key: `Authorization: Bearer sk_<value>` for session-management endpoints.
- Session token: an opaque value returned once when a session is created and passed to the validation endpoint body.
- Demo-user browser session: an HTTP-only cookie created through hosted verification or sign-in. It also authorizes the console (ADR-014).

Registration accepts only approved `@authforge.demo` labels. Verification and reset links are sent to one configured, SES-verified evaluation inbox; the flow proves access to that inbox, not ownership of the synthetic alias. There is no public onboarding, social login, MFA, or user roles.

## Error model

Errors use this stable shape:

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "The supplied API key is invalid.",
    "request_id": "req_123"
  }
}
```

Use `400` for invalid input, `401` for invalid or expired credentials, `403` for failed console origin or CSRF checks, `404` for unknown or undiscoverable resources, `409` for conflicting state, `429` for rate or showcase-capacity limits, and `503` for unavailable required dependencies. Do not expose stack traces, SQL, or AWS errors.

## Health endpoints

| Method and path | Auth | Contract |
| --- | --- | --- |
| `GET /health/live` | none | Returns `200` while the process event loop can serve requests. |
| `GET /health/ready` | none | Returns `200` only when required PostgreSQL, Redis, and AWS configuration checks pass. It does not execute SES delivery. |

## Console protection

Console routes use the demo-user browser session. Sign-in or email verification sets the `authforge_user` cookie (`HttpOnly`, `Secure` outside local development, `SameSite=Strict`) and returns a random `csrf_token`; `GET /v1/auth/me` returns it again after a reload. The server stores only its digest. There is one shared console: every signed-in verified user sees and manages the same API keys, sessions, and events.

Every cookie-authenticated `POST`, `PUT`, `PATCH`, or `DELETE` request must:

- Send the token in `X-CSRF-Token`.
- Send an `Origin` header exactly matching a configured console origin.

Missing or invalid proof returns `403 invalid_csrf`. `GET` routes still enforce the configured origin when called from a browser. A console request without a valid browser session returns `401 invalid_user_credentials`.

## Console endpoints

| Method and path | Auth | Contract |
| --- | --- | --- |
| `GET /v1/console/state` | browser session cookie | Returns API-key summaries, session summaries, redacted showcase-event status, and a read-only `users` list (`[{id,email,email_verified,created_at}]`, newest first, at most 200, excluding disabled users) needed by the dashboard. User summaries never include password hashes, tokens, or digests. |
| `DELETE /v1/console/sessions/{session_id}` | browser session cookie + CSRF | Revokes any application session selected in the console and returns `204`; repeated revocation also returns `204`. |

## Hosted demo-user endpoints

| Method and path | Auth | Contract |
| --- | --- | --- |
| `POST /v1/auth/register` | exact trusted Origin | `{email,password}`. Creates a pending user and one-hour verification action for an approved `@authforge.demo` label. Returns the same `202` generic message for new and duplicate addresses. Sends the link only to the configured test inbox. |
| `POST /v1/auth/verification-email` | exact trusted Origin | `{email}`. Invalidates prior active verification links and sends a replacement when the account is pending. Always returns generic `202`. |
| `POST /v1/auth/verify-email` | exact trusted Origin | `{token}`. Consumes a valid one-hour link once, marks the account verified, creates a browser session, and returns `{user:{id,email},csrf_token}` with an HTTP-only cookie. |
| `POST /v1/auth/login` | exact trusted Origin | `{email,password}`. Requires a verified account. Unknown, unverified, and incorrect-password cases share `401 invalid_user_credentials`. Successful requests create a browser session and return `{user:{id,email},csrf_token}` with `Cache-Control: no-store`. |
| `POST /v1/auth/password-reset` | exact trusted Origin | `{email}`. Invalidates previous active reset links and sends a 15-minute link only for an eligible account. Always returns generic `202`. |
| `POST /v1/auth/password-reset/confirm` | exact trusted Origin | `{token,password}`. Consumes a valid reset link once, stores a new Argon2id hash, revokes all browser sessions for the account, and returns `204`. |
| `GET /v1/auth/me` | user cookie | Returns `{user:{id,email},csrf_token}` for the current active browser session; `401 invalid_user_credentials` otherwise. This restores sign-out proof after reload and uses `Cache-Control: no-store`. |
| `DELETE /v1/auth/session` | user cookie + CSRF | Revokes the current browser session, clears the cookie, and returns `204`. |

The user cookie is HTTP-only, `SameSite=Strict`, and `Secure` outside local development. The registration, login, and user-session endpoints never return password data.

## API-key endpoints

| Method and path | Auth | Contract |
| --- | --- | --- |
| `POST /v1/api-keys` | console cookie + CSRF | `{name}`. Creates a key and returns `201` with `{id,name,prefix,secret,created_at}`. `secret` appears only in this response. |
| `GET /v1/api-keys` | console cookie | Returns `{data:[...]}` with `id`, `name`, `prefix`, `created_at`, and `revoked_at`. |
| `DELETE /v1/api-keys/{key_id}` | console cookie + CSRF | Revokes the key and all sessions created by it in one transaction. Returns `204`, including repeated revocation. |

API keys have no scopes, project association, environment association, or user permissions.

## Session endpoints

| Method and path | Auth | Contract |
| --- | --- | --- |
| `POST /v1/sessions` | secret API key | `{subject,ttl_seconds?}`. Creates a session for a synthetic subject. Returns `201` with `{id,subject,token,created_at,expires_at}`. `token` appears only in this response. |
| `POST /v1/sessions/validate` | secret API key | `{token}`. Returns `200` with `{valid:true,session:{id,subject,created_at,expires_at}}` for an active session owned by the key. Invalid, expired, revoked, or differently owned tokens return `401 invalid_session`. |
| `GET /v1/sessions` | secret API key | Returns `{data:[...]}` for sessions created by that API key. Raw tokens and digests are omitted. |
| `DELETE /v1/sessions/{session_id}` | secret API key | Revokes a session owned by the key. Returns `204`; repeated revoke also returns `204`. Another key's session is undiscoverable and returns `404`. |

`subject` is an opaque synthetic label, not a managed user identity. It must be short, non-empty, and free of sensitive data. Default and maximum TTL values come from validated configuration.

## Event contract

Every API-key or session mutation appends a versioned outbox event in the same PostgreSQL transaction. SQS payloads contain only redacted identifiers and correlation data defined in `ARCHITECTURE.md`. Event delivery is asynchronous and does not change the HTTP response body.

## Compatibility policy

The `/v1` contract is stable for the showcase implementation and tests, but there is no long-term support commitment. An incompatible change must update this document and its contract tests in the same change.

## Local-demo implementation details

- “Approved” means a synthetic label matching `@authforge.demo`; the configured test inbox is the sole SES destination. Verification proves access to that inbox, not ownership of the alias. Verification links expire in one hour; reset links expire in 15 minutes; both are one-time keyed-digest records.
- Hosted authentication mutations require the exact configured Origin. Cookie-authenticated session deletion also requires the CSRF token. Bad proof returns `403 invalid_csrf`.
- Hosted authentication attempts are bounded per client using Redis. Registration and login share an attempt window, including successes; this also bounds password-hashing work.
- Browser sessions, which also authorize the console, expire after one hour. Application sessions default to 15 minutes with a configured maximum of one hour.
- User/session capacity checks and pending registration writes occur atomically. Duplicate registrations do not disclose account state. API-key capacity counts all keys retained for the demo; session capacity counts active sessions only.
- Every response is `no-store`, including errors. Malformed JSON and oversized bodies return `400 invalid_request` in the stable error envelope. Unknown routes return `404 not_found` in that envelope.
- Sessions use opaque tokens only. There is no JWT/JWKS or refresh endpoint.
- Redis validation hints contain only session IDs under credential digests and expire within 30 seconds. Every validation still checks PostgreSQL; cache loss or stale hints cannot grant access.
- Console state includes `events`: up to 50 `{id,event_type,created_at,published_at,processed_at}` summaries. Timestamps for incomplete stages are null.
