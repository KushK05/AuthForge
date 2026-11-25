import { footer, renderPage, siteNav } from "./theme.js";

const css = String.raw`
.hero{padding-top:56px;padding-bottom:32px;display:grid;gap:40px;align-items:center}
@media (min-width:920px){.hero{grid-template-columns:1.05fr .95fr;padding-top:88px;padding-bottom:48px;gap:56px}}
.hero h1{font-size:clamp(34px,6vw,56px);letter-spacing:-.035em;margin:16px 0}
.hero .lead{font-size:18px;color:var(--muted);max-width:560px}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.hero-note{margin-top:16px}
.visual{min-width:0}
.visual .codeblock{margin:0;box-shadow:var(--shadow)}
.visual pre{font-size:12.5px}
section.block{padding-top:72px}
.eyebrow{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-text)}
.block h2{font-size:clamp(26px,4vw,36px);margin:8px 0 12px}
.block .sub{color:var(--muted);max-width:640px;font-size:17px}
.grid{display:grid;gap:16px;margin-top:32px;grid-template-columns:1fr}
@media (min-width:640px){.grid{grid-template-columns:repeat(2,1fr)}}
@media (min-width:960px){.grid{grid-template-columns:repeat(3,1fr)}}
.feature{padding:22px}
.feature .icon{width:40px;height:40px;border-radius:10px;background:var(--accent-soft);color:var(--accent-text);display:grid;place-items:center;margin-bottom:14px}
.feature h3{font-size:17px;margin-bottom:6px}
.feature p{color:var(--muted);font-size:15px}
.steps{display:grid;gap:16px;margin-top:32px;counter-reset:step}
@media (min-width:800px){.steps{grid-template-columns:repeat(3,1fr)}}
.step{padding:22px;position:relative;min-width:0}
.step::before{counter-increment:step;content:counter(step);display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;font-size:14px;margin-bottom:12px}
.step h3{font-size:17px;margin-bottom:6px}
.step p{color:var(--muted);font-size:15px;margin-bottom:12px}
.step pre{margin:0;padding:10px 12px;background:var(--code-bg);color:var(--code-text);border-radius:8px;font-size:12px;overflow-x:auto}
.dev{padding:28px;display:grid;gap:16px;align-items:center}
@media (min-width:800px){.dev{grid-template-columns:1fr auto;padding:36px}}
.dev h2{font-size:26px;margin-bottom:8px}
`;

const icon = (path: string): string =>
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const features: ReadonlyArray<[string, string, string]> = [
  ["Hosted sign-up and sign-in", "Ready-made pages for registration and password sign-in, with Argon2id password hashing and rate limiting.", icon('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>')],
  ["Email verification", "Accounts must verify their email through a one-time link before they can sign in.", icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>')],
  ["Password reset", "Short-lived, single-use reset links keep recovery simple and safe to demo.", icon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>')],
  ["API keys", "Create secret API keys in the console. Each key is shown once and stored only as a keyed digest.", icon('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>')],
  ["Scoped application sessions", "Issue short-lived session tokens for your users. Sessions belong to the API key that created them.", icon('<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>')],
  ["Revocation and expiry", "Expired or revoked sessions fail validation immediately. Revoking a key invalidates its sessions.", icon('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>')]
];

const body = `${siteNav()}
<main>
<div class="container hero">
  <div>
    <span class="badge">Hosted authentication demo</span>
    <h1>Authentication your app can plug into in minutes.</h1>
    <p class="lead">AuthForge gives you hosted sign-up and sign-in, email verification, password reset, API keys, and scoped application sessions behind one small HTTP API.</p>
    <div class="cta"><a class="btn btn-primary btn-lg" href="/signup">Get started</a><a class="btn btn-secondary btn-lg" href="/login">Sign in</a></div>
    <p class="hero-note small muted">Temporary demo environment. Only synthetic <code>@authforge.demo</code> accounts are accepted.</p>
  </div>
  <div class="visual" aria-label="Example API requests">
    <div class="codeblock"><div class="code-title"><span>Create and validate a session</span></div><pre><code><span class="tok-c"># 1. Create a session for your user</span>
curl -X POST $AUTHFORGE_URL/v1/sessions \\
  -H "Authorization: Bearer sk_..." \\
  -d '{"subject":"demo-user-42"}'

<span class="tok-c"># 2. Validate the token later</span>
curl -X POST $AUTHFORGE_URL/v1/sessions/validate \\
  -H "Authorization: Bearer sk_..." \\
  -d '{"token":"sess_..."}'

<span class="tok-c"># Response</span>
{ <span class="tok-k">"valid"</span>: <span class="tok-s">true</span>,
  <span class="tok-k">"session"</span>: { <span class="tok-k">"subject"</span>: <span class="tok-s">"demo-user-42"</span> } }</code></pre></div>
  </div>
</div>

<section id="features" class="block container">
  <div class="eyebrow">Features</div>
  <h2>What is in the box</h2>
  <p class="sub">Everything below is implemented and available in this demo.</p>
  <div class="grid">
    ${features.map(([title, text, svg]) => `<article class="card feature"><div class="icon">${svg}</div><h3>${title}</h3><p>${text}</p></article>`).join("")}
  </div>
</section>

<section id="how" class="block container">
  <div class="eyebrow">How it works</div>
  <h2>Three steps from key to verified session</h2>
  <div class="steps">
    <div class="card step"><h3>Create an API key</h3><p>Sign in to the console and create a key. Copy it once; it is not shown again.</p><pre>sk_...</pre></div>
    <div class="card step"><h3>Create a session for a user</h3><p>Call the API from your backend with the key and a subject identifier.</p><pre>POST /v1/sessions</pre></div>
    <div class="card step"><h3>Validate the token</h3><p>Check the session token on each request until it expires or is revoked.</p><pre>POST /v1/sessions/validate</pre></div>
  </div>
</section>

<section id="developers" class="block container">
  <div class="card dev">
    <div><div class="eyebrow">Developers</div><h2>Read the API docs</h2><p class="muted">Quickstart, endpoint reference with curl examples, the error model, and security notes.</p></div>
    <a class="btn btn-primary btn-lg" href="/docs">Open the docs</a>
  </div>
</section>
</main>
${footer}`;

export const landingPage = renderPage({ title: "AuthForge - Hosted authentication demo", description: "Hosted sign-up and sign-in, email verification, password reset, API keys, and scoped application sessions.", page: "landing", body, css, script: "/app.js" });
