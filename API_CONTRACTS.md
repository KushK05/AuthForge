# API contracts

## Conventions

Base path is `/v1`. JSON uses `application/json`, timestamps are ISO-8601 UTC, IDs are opaque UUID-like strings, and pagination is cursor based. Every response includes `X-Request-Id`; clients may supply one that passes validation. Documented endpoints must have an OpenAPI specification generated from or checked against these contracts.

Authentication schemes:

- `Publishable key`: `Authorization: Bearer pk_<value>`. Identifies a project for public end-user flows. It is not privileged.
- `Secret API key`: `Authorization: Bearer sk_<value>`. Server-to-server management only. Requires key scopes.
- `User access JWT`: `Authorization: Bearer <jwt>`. Used for an authenticated end user in a project.
- `Developer session`: a separate, secure, HTTP-only browser session for console routes. Never accept it for end-user project APIs.

All state-changing `POST`, `PUT`, `PATCH`, and `DELETE` endpoints accept `Idempotency-Key` unless explicitly exempted. The key is unique within authenticated principal, route, and project for 24 hours. Reuse with a different request hash returns `409 idempotency_key_reused`.

## Error model

Errors use RFC 9457 problem details:

```json
{
  "type": "https://authforge.example/problems/invalid-credentials",
  "title": "Authentication failed",
  "status": 401,
  "code": "invalid_credentials",
  "request_id": "req_..."
}
```

Use `400` invalid request, `401` invalid or expired credentials, `403` authenticated but forbidden, `404` undiscoverable resources, `409` conflicting state, `422` valid syntax but rejected policy, `429` rate-limited, and `503` unavailable dependency. Sign-in and reset requests must not disclose whether an email exists.

## End-user auth endpoints

| Method and path | Auth | Contract |
| --- | --- | --- |
| `POST /v1/sign-ups` | publishable key | `{email,password,redirect_url?}`. Creates pending user and queues verification. Returns `202` with non-sensitive status. |
| `POST /v1/email-verifications/confirm` | token | `{token}`. Single-use confirmation. Returns verified user summary. |
| `POST /v1/sign-ins` | publishable key | `{email,password}`. Returns `access_token`, `refresh_token`, `expires_in`, and user summary. Generic `401` on failure. |
| `POST /v1/token` | refresh token | `{refresh_token}`. Atomically rotates refresh token. Returns a new token pair. |
| `POST /v1/sign-outs` | access JWT | Revokes current session. `204` is idempotent. |
| `POST /v1/password-resets` | publishable key | `{email,redirect_url?}`. Always returns `202`; queues email when eligible. |
| `POST /v1/password-resets/confirm` | token | `{token,new_password}`. Consumes token and revokes all sessions. |
| `GET /v1/me` | access JWT | Returns caller's project-scoped profile, roles, and session summary. |

Refresh tokens are sent only in an HTTP-only Secure SameSite cookie for browser flows, or in the JSON request body for explicitly enabled native-client flows. Never accept them in a query parameter. Responses with token material have `Cache-Control: no-store`.

## Developer management endpoints

| Method and path | Required scope | Contract |
| --- | --- | --- |
| `POST /v1/developer/projects` | `projects:write` | `{name}`. Creates a project and its default development environment. Returns `201` with the project and environment summary; an idempotent replay returns the same summary with `200`. |
| `GET /v1/developer/projects` | `projects:read` | Lists only projects within the developer organization. |
| `POST /v1/developer/projects/{project_id}/keys` | `keys:write` | `{kind,scopes}`. Creates a scoped secret key or an unscoped publishable key for a project in the caller's organization. The raw key is returned only in the initial `201` response and is omitted from an idempotent replay (`200`). |
| `DELETE /v1/developer/projects/{project_id}/keys/{key_id}` | `keys:write` | Revokes a key immediately. |
| `PUT /v1/developer/projects/{project_id}/redirect-urls` | `projects:write` | Replaces validated HTTPS redirect allowlist. Localhost allowed only in development. |
| `POST /v1/developer/projects/{project_id}/roles` | `roles:write` | Creates a role with known permissions. |
| `PUT /v1/developer/projects/{project_id}/users/{user_id}/roles` | `roles:write` | Replaces the user's role assignment set. |
| `GET /v1/developer/projects/{project_id}/audit-events` | `audit:read` | Cursor-paginated, redacted audit view. |

## JWT contract

Access JWTs are asymmetric and include `iss`, `aud`, `sub`, `exp`, `iat`, `jti`, `sid`, `project_id`, `token_version`, `roles`, and `scope` as applicable. `aud` is the project environment identifier. Default lifetime is 15 minutes. Publish a project-scoped JWKS endpoint at `GET /v1/projects/{project_id}/.well-known/jwks.json` with cache headers and key ID rotation overlap. Consumers must verify signature, issuer, audience, expiration, not-before when present, and project context.

## Compatibility policy

Add fields and endpoints freely. Do not remove, rename, narrow semantics, or change error codes within `/v1`. Deprecate with documentation and response headers, then introduce `/v2` only after a migration window. Keep an executable contract test suite for all published behavior.
