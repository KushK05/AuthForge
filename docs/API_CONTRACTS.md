# API contracts

## Conventions

The base path is `/v1`. JSON uses `application/json`, timestamps use ISO-8601 UTC, and IDs are opaque strings. Every response includes `X-Request-Id`. Responses containing raw secrets include `Cache-Control: no-store`.

There are four credentials:

- Console access code: stored in Secrets Manager and exchanged for a short-lived, HTTP-only console cookie.
- Secret API key: `Authorization: Bearer sk_<value>` for session-management endpoints.
- Session token: an opaque value returned once when a session is created and passed to the validation endpoint body.
- Demo-user browser session: an HTTP-only cookie created through hosted registration or sign-in.

The prototype does not support public onboarding, email verification, password reset, social login, MFA, or user roles. Registration accepts only approved `@authforge.demo` addresses.

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

Successful console login sets an `HttpOnly`, `Secure` outside local development, `SameSite=Strict` cookie and returns a random `csrf_token` in the JSON body. The server stores only its digest with the console session.

Every cookie-authenticated `POST`, `PUT`, `PATCH`, or `DELETE` request must:

- Send the token in `X-CSRF-Token`.
- Send an `Origin` header exactly matching a configured console origin.

Missing or invalid proof returns `403 invalid_csrf`. `GET` routes still enforce the configured origin when called from a browser.

## Console endpoints

| Method and path | Auth | Contract |
| --- | --- | --- |
| `POST /v1/console/session` | none | `{access_code}`. Creates a short-lived console session and returns `{csrf_token}` with `Cache-Control: no-store`. Repeated failures use Redis-backed rate limits and the same `401 invalid_console_access` response. |
| `DELETE /v1/console/session` | console cookie + CSRF | Revokes the current console session, clears the cookie, and returns `204`. |
| `GET /v1/console/state` | console cookie | Returns API-key summaries, session summaries, and redacted showcase-event status needed by the dashboard. |
| `DELETE /v1/console/sessions/{session_id}` | console cookie + CSRF | Revokes any application session selected in the console and returns `204`; repeated revocation also returns `204`. |

## Hosted demo-user endpoints

| Method and path | Auth | Contract |
| --- | --- | --- |
| `POST /v1/auth/register` | none | `{email,password}`. Accepts an unused approved `@authforge.demo` email and a password of at least 12 characters. Creates a user and browser session; returns `{user:{id,email},csrf_token}` with `Cache-Control: no-store`. |
| `POST /v1/auth/login` | none | `{email,password}`. Returns the same `401 invalid_user_credentials` failure for unknown users and incorrect passwords. Successful requests create a browser session and return `{user:{id,email},csrf_token}` with `Cache-Control: no-store`. |
| `GET /v1/auth/me` | user cookie | Returns `{user:{id,email}}` for the current active browser session. |
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
