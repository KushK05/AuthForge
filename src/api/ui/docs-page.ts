import { footer, renderPage, siteNav } from "./theme.js";

const css = String.raw`
.docs{display:grid;gap:24px;padding-top:32px}
@media (min-width:960px){.docs{grid-template-columns:240px minmax(0,1fr);gap:48px;padding-top:48px;align-items:start}}
.toc{border:1px solid var(--border);border-radius:var(--r);background:var(--surface);padding:12px 14px}
.toc summary{cursor:pointer;font-weight:700;font-size:14px;padding:4px 0}
.toc ul{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:2px}
.toc a{display:block;padding:6px 10px;border-radius:8px;color:var(--muted);text-decoration:none;font-size:14px}
.toc a:hover{background:var(--surface-2);color:var(--text)}
.toc ul ul{margin:0 0 4px 12px}
@media (min-width:960px){.toc{position:sticky;top:84px;max-height:calc(100vh - 108px);overflow:auto}}
.content{min-width:0;max-width:780px}
.content section{padding-top:8px;margin-bottom:48px;scroll-margin-top:84px}
.content h1{font-size:clamp(28px,4vw,38px);margin-bottom:12px}
.content h2{font-size:26px;margin-bottom:12px;padding-top:8px}
.content h3{font-size:18px;margin:28px 0 8px;scroll-margin-top:84px}
.content p,.content li{color:var(--text)}
.content p{margin-bottom:12px}
.content ul,.content ol{padding-left:22px;margin:0 0 14px}
.content li{margin-bottom:6px}
.content :not(pre)>code{background:var(--surface-2);border:1px solid var(--border);padding:1px 6px;border-radius:6px;font-size:.88em}
.endpoint{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:28px 0 12px}
.endpoint h3{margin:0;font:600 17px var(--mono)}
.tbl{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 20px;display:block;overflow-x:auto}
.tbl th,.tbl td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--border);vertical-align:top}
.tbl th{color:var(--muted);font-weight:600;white-space:nowrap}
.tbl td:first-child{white-space:nowrap}
.callout{border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:var(--r);background:var(--surface);padding:12px 16px;margin:16px 0;font-size:15px}
.callout.warn{border-left-color:var(--warn)}
`;

const esc = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const code = (title: string, text: string): string =>
  `<div class="codeblock"><div class="code-title"><span>${esc(title)}</span><button class="copy" type="button" data-copy>Copy</button></div><pre><code>${esc(text.trim())}</code></pre></div>`;

const endpoint = (method: "GET" | "POST" | "DELETE", path: string, id: string): string =>
  `<div class="endpoint" id="${id}"><span class="method m-${method.toLowerCase()}">${method}</span><h3>${path}</h3></div>`;

const table = (head: string[], rows: string[][]): string =>
  `<table class="tbl"><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

const toc = `<details class="toc" open><summary>On this page</summary><ul>
<li><a href="#overview">Overview</a></li>
<li><a href="#quickstart">Quickstart</a></li>
<li><a href="#authentication">Authentication</a></li>
<li><a href="#api">API reference</a><ul>
<li><a href="#create-session">Create a session</a></li>
<li><a href="#validate-session">Validate a session</a></li>
<li><a href="#list-sessions">List sessions</a></li>
<li><a href="#revoke-session">Revoke a session</a></li></ul></li>
<li><a href="#accounts">Hosted account flows</a></li>
<li><a href="#sessions-model">Sessions model</a></li>
<li><a href="#errors">Errors</a></li>
<li><a href="#security">Security notes</a></li></ul></details>`;

const body = `${siteNav("docs")}
<div class="container docs">
<aside>${toc}</aside>
<article class="content">
<h1>AuthForge documentation</h1>
<p class="muted">Usage guide for the AuthForge demo: hosted accounts, API keys, and application sessions.</p>

<section id="overview"><h2>Overview</h2>
<p>AuthForge is a small hosted authentication service. In this demo it provides hosted demo-user sign-up and sign-in, a developer console for creating API keys, an HTTP API for creating and validating application sessions, and lifecycle events recorded for each change.</p>
<div class="callout warn"><strong>Demo limits.</strong>
<ul style="margin:8px 0 0">
<li>Only <code>@authforge.demo</code> accounts can register. Use synthetic data only.</li>
<li>Verification and reset emails are sent to the operator's configured demo inbox, never to the address you enter.</li>
<li>This is a temporary environment that is destroyed after evaluation. All data is deleted with it.</li>
<li>The deployment serves plain HTTP, so do not use real credentials.</li>
</ul></div>
<p class="small muted">On this deployment, <code>AUTHFORGE_URL</code> is <code data-origin>this site's origin</code>.</p>
</section>

<section id="quickstart"><h2>Quickstart</h2>
<ol>
<li>Create an account at <a href="/signup">/signup</a> with an <code>@authforge.demo</code> email and a password of at least 12 characters.</li>
<li>Open the verification email in the demo inbox and follow the link. You are signed in automatically.</li>
<li>Open the <a href="/console">console</a> and create an API key. The key is shown once, so copy it now.</li>
<li>Create a session for one of your users, then validate its token.</li>
</ol>
${code("shell", `
export AUTHFORGE_URL="<this deployment's origin>"
export AUTHFORGE_API_KEY="sk_..."

# Create a session (returns the token once)
curl -s -X POST "$AUTHFORGE_URL/v1/sessions" \\
  -H "Authorization: Bearer $AUTHFORGE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"subject":"demo-user-42"}'

# Validate the token you received
curl -s -X POST "$AUTHFORGE_URL/v1/sessions/validate" \\
  -H "Authorization: Bearer $AUTHFORGE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"token":"sess_..."}'
`)}
</section>

<section id="authentication"><h2>Authentication</h2>
<p>The <code>/v1/sessions</code> endpoints authenticate with your secret API key in the <code>Authorization</code> header:</p>
${code("header", "Authorization: Bearer sk_<your key>")}
<p>The developer console uses your signed-in browser session (an HTTP-only cookie plus a CSRF token). It is a web application, not an API for scripts. Use API keys for everything you automate.</p>
</section>

<section id="api"><h2>API reference</h2>
<p>All request and response bodies are JSON. All responses are <code>Cache-Control: no-store</code>. Examples use the placeholders <code>$AUTHFORGE_URL</code> and <code>$AUTHFORGE_API_KEY</code>.</p>

${endpoint("POST", "/v1/sessions", "create-session")}
<p>Creates an application session for a subject and returns its token. The token is shown only in this response.</p>
${table(["Body field", "Type", "Description"], [
  ["<code>subject</code>", "string, required", "Identifier of your user, 1 to 128 characters. Use a synthetic identifier."],
  ["<code>ttl_seconds</code>", "integer, optional", "Lifetime in seconds, from 30 up to the deployment maximum (3600 by default). Defaults to 900."]
])}
${code("request", `
curl -s -X POST "$AUTHFORGE_URL/v1/sessions" \\
  -H "Authorization: Bearer $AUTHFORGE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"subject":"demo-user-42","ttl_seconds":900}'
`)}
${code("201 response", `
{
  "id": "7b1c2e0a-5d3f-4c1e-9a62-0f4d8a1b2c3d",
  "api_key_id": "3f9d6a4e-1b2c-4d5e-8f70-a1b2c3d4e5f6",
  "subject": "demo-user-42",
  "created_at": "2026-01-01T12:00:00.000Z",
  "expires_at": "2026-01-01T12:15:00.000Z",
  "token": "sess_..."
}
`)}
<p>Status codes: <code>201</code> created, <code>400</code> <code>invalid_request</code>, <code>401</code> <code>invalid_api_key</code>, <code>429</code> <code>capacity_exceeded</code>.</p>

${endpoint("POST", "/v1/sessions/validate", "validate-session")}
<p>Checks a session token issued by the same API key.</p>
${table(["Body field", "Type", "Description"], [["<code>token</code>", "string, required", "The session token returned at creation."]])}
${code("request", `
curl -s -X POST "$AUTHFORGE_URL/v1/sessions/validate" \\
  -H "Authorization: Bearer $AUTHFORGE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"token":"sess_..."}'
`)}
${code("200 response", `
{
  "valid": true,
  "session": {
    "id": "7b1c2e0a-5d3f-4c1e-9a62-0f4d8a1b2c3d",
    "api_key_id": "3f9d6a4e-1b2c-4d5e-8f70-a1b2c3d4e5f6",
    "subject": "demo-user-42",
    "created_at": "2026-01-01T12:00:00.000Z",
    "expires_at": "2026-01-01T12:15:00.000Z"
  }
}
`)}
<p>Status codes: <code>200</code> valid, <code>400</code> <code>invalid_request</code>, <code>401</code> <code>invalid_api_key</code> or <code>invalid_session</code> (unknown, expired, revoked, or issued by another key).</p>

${endpoint("GET", "/v1/sessions", "list-sessions")}
<p>Lists sessions created by the calling API key, including expired and revoked ones. Revoked sessions include <code>revoked_at</code>.</p>
${code("request", `
curl -s "$AUTHFORGE_URL/v1/sessions" \\
  -H "Authorization: Bearer $AUTHFORGE_API_KEY"
`)}
${code("200 response", `
{
  "data": [
    {
      "id": "7b1c2e0a-5d3f-4c1e-9a62-0f4d8a1b2c3d",
      "api_key_id": "3f9d6a4e-1b2c-4d5e-8f70-a1b2c3d4e5f6",
      "subject": "demo-user-42",
      "created_at": "2026-01-01T12:00:00.000Z",
      "expires_at": "2026-01-01T12:15:00.000Z"
    }
  ]
}
`)}
<p>Status codes: <code>200</code>, <code>401</code> <code>invalid_api_key</code>.</p>

${endpoint("DELETE", "/v1/sessions/:sessionId", "revoke-session")}
<p>Revokes a session created by the calling API key. Validation fails immediately afterwards. <code>sessionId</code> is the UUID from the <code>id</code> field.</p>
${code("request", `
curl -s -X DELETE "$AUTHFORGE_URL/v1/sessions/7b1c2e0a-5d3f-4c1e-9a62-0f4d8a1b2c3d" \\
  -H "Authorization: Bearer $AUTHFORGE_API_KEY"
`)}
<p>Status codes: <code>204</code> revoked (empty body), <code>400</code> <code>invalid_request</code> for a malformed id, <code>401</code> <code>invalid_api_key</code>, <code>404</code> <code>not_found</code> for an unknown session or one owned by another key.</p>
</section>

<section id="accounts"><h2>Hosted account flows</h2>
<p>These flows are used by the web pages in this site. They are cookie-and-CSRF based and meant for browsers.</p>
<ol>
<li><strong>Sign up</strong> at <a href="/signup">/signup</a>. A verification email is sent to the operator's demo inbox. The response is the same whether or not the address is already registered.</li>
<li><strong>Verify email.</strong> The link opens <code>/verify-email</code> and expires after 1 hour. Verifying signs you in.</li>
<li><strong>Sign in</strong> at <a href="/login">/login</a>. Only verified accounts can sign in. A browser session lasts 1 hour. You can sign out from the console.</li>
<li><strong>Forgot password.</strong> Request a link at <a href="/forgot-password">/forgot-password</a>. The reset link expires after 15 minutes and works once. Resetting signs out existing browser sessions.</li>
</ol>
<p>Verification and reset links carry their token in the URL fragment, so it is not sent to the server in the page request.</p>
</section>

<section id="sessions-model"><h2>Sessions model</h2>
<ul>
<li>A session is scoped to the API key that created it. Other keys cannot list, validate, or revoke it; they receive <code>invalid_session</code> or <code>not_found</code>.</li>
<li>A session stops validating when it expires (<code>expires_at</code>) or when it is revoked.</li>
<li>Revoking an API key in the console invalidates every session it created.</li>
<li>Session tokens are random opaque strings (<code>sess_...</code>). Treat them as secrets.</li>
</ul>
</section>

<section id="errors"><h2>Errors</h2>
<p>Every error uses the same shape. Include <code>request_id</code> when asking for help.</p>
${code("error body", `
{
  "error": {
    "code": "invalid_api_key",
    "message": "The supplied API key is invalid.",
    "request_id": "req_..."
  }
}
`)}
${table(["Status", "Code", "Meaning"], [
  ["400", "<code>invalid_request</code>", "The body, parameter, or header failed validation."],
  ["401", "<code>invalid_api_key</code>", "The API key is missing, malformed, unknown, or revoked."],
  ["401", "<code>invalid_session</code>", "The session token is unknown, expired, revoked, or belongs to another key."],
  ["401", "<code>invalid_user_credentials</code>", "Hosted sign-in failed or there is no signed-in browser session."],
  ["401", "<code>invalid_credentials</code>", "A one-time verification or reset link is invalid, expired, or used."],
  ["403", "<code>invalid_csrf</code>", "A browser request had a bad Origin or CSRF token."],
  ["404", "<code>not_found</code>", "The resource does not exist or is not visible to the caller."],
  ["409", "<code>conflict</code>", "The request conflicts with existing state."],
  ["429", "<code>rate_limited</code>", "Too many sign-in or sign-up attempts. Wait a minute."],
  ["429", "<code>capacity_exceeded</code>", "A demo capacity limit (keys, sessions, or users) was reached."],
  ["503", "<code>dependency_unavailable</code>", "A required backing service is unavailable. Retry shortly."],
  ["500", "<code>internal_error</code>", "Unexpected server error."]
])}
</section>

<section id="security"><h2>Security notes</h2>
<ul>
<li>Never put an API key in browser code or a mobile app. Call AuthForge from your backend.</li>
<li>API keys and session tokens are returned once and stored only as keyed digests. AuthForge cannot show them again.</li>
<li>Sign-in and sign-up are rate limited. Passwords are hashed with Argon2id.</li>
<li>Session lifetimes are short and bounded. Revoke sessions you no longer need.</li>
<li>This is a demo: use synthetic data only and expect the environment to be deleted.</li>
</ul>
</section>
</article>
</div>
${footer}`;

export const docsPage = renderPage({ title: "Documentation - AuthForge", description: "AuthForge quickstart, API reference, errors, and security notes.", page: "docs", body, css, script: "/app.js" });
