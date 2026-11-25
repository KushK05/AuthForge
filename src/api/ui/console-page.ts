import { renderPage, wordmark } from "./theme.js";

const css = String.raw`
.topbar{position:sticky;top:0;z-index:20;background:var(--surface);border-bottom:1px solid var(--border)}
.topbar-inner{display:flex;align-items:center;gap:12px;min-height:60px}
.topbar .who{margin-left:auto;display:flex;align-items:center;gap:8px;min-width:0}
.topbar .email{font-size:14px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:36vw}
@media (max-width:520px){.topbar .email{display:none}.topbar .docs-link{display:none}}
.console{padding-top:24px}
.console h1{font-size:26px}
.console .lede{color:var(--muted);margin:4px 0 20px}
.metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px}
@media (min-width:720px){.metrics{grid-template-columns:repeat(4,1fr)}}
.metric{padding:16px}
.metric .n{font-size:28px;font-weight:700;letter-spacing:-.02em}
.metric .l{font-size:13px;color:var(--muted)}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:20px;overflow-x:auto}
.tab{padding:10px 14px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--muted);font:600 14.5px var(--font);cursor:pointer;white-space:nowrap}
.tab:hover{color:var(--text)}
.tab[aria-selected="true"]{color:var(--accent-text);border-bottom-color:var(--accent)}
.panel{padding:20px}
.panel + .panel{margin-top:16px}
.panel h2{font-size:18px;margin-bottom:4px}
.panel .sub{color:var(--muted);font-size:14px;margin-bottom:16px}
.inline-form{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.inline-form .field{margin:0;flex:1 1 240px}
.secret{margin-top:16px;padding:14px;border:1px solid var(--warn);border-radius:var(--r);background:var(--warn-soft)}
.secret strong{display:block;margin-bottom:8px;color:var(--text)}
.secret code{display:block;padding:10px 12px;background:var(--code-bg);color:var(--code-text);border-radius:8px;overflow-wrap:anywhere;font-size:13px}
.secret .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.list{list-style:none;margin:0;padding:0}
.item{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding:14px 0;border-top:1px solid var(--border)}
.item:first-child{border-top:0}
.item .main{min-width:0;flex:1 1 220px}
.item .title{font-weight:600;overflow-wrap:anywhere}
.item .meta{font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.empty{padding:24px 0;text-align:center;color:var(--muted)}
dialog{border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface);color:var(--text);padding:24px;max-width:min(420px,calc(100vw - 32px));box-shadow:var(--shadow)}
dialog::backdrop{background:rgba(8,12,24,.55)}
dialog h2{font-size:18px;margin-bottom:8px}
dialog p{color:var(--muted);margin-bottom:16px}
.dialog-actions{display:flex;justify-content:flex-end;gap:8px}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--code-bg);color:#fff;padding:10px 16px;border-radius:var(--r);font-size:14px;box-shadow:var(--shadow);z-index:50;max-width:calc(100vw - 32px)}
`;

const body = `<header class="topbar"><div class="container topbar-inner">${wordmark("/console")}<span class="chip">Console</span><div class="who"><a class="btn btn-ghost btn-sm docs-link" href="/docs">Docs</a><span id="user-email" class="email"></span><button id="signout" class="btn btn-secondary btn-sm" type="button">Sign out</button></div></div></header>
<main class="container console" id="app" hidden>
<h1>Developer console</h1>
<p class="lede">Shared demo console: everyone signed in sees and manages the same API keys, sessions, and events.</p>
<div id="page-error" class="alert alert-error" role="alert"></div>
<div class="metrics" aria-label="Overview">
<div class="card metric"><div class="n" id="m-keys">0</div><div class="l">Active API keys</div></div>
<div class="card metric"><div class="n" id="m-sessions">0</div><div class="l">Active sessions</div></div>
<div class="card metric"><div class="n" id="m-events">0</div><div class="l">Events recorded</div></div>
<div class="card metric"><div class="n" id="m-pending">0</div><div class="l">Events pending</div></div>
</div>
<div class="tabs" role="tablist" aria-label="Console sections">
<button class="tab" role="tab" id="tab-keys" data-view="keys" aria-selected="true" aria-controls="view-keys" type="button">API keys</button>
<button class="tab" role="tab" id="tab-sessions" data-view="sessions" aria-selected="false" aria-controls="view-sessions" type="button">Sessions</button>
<button class="tab" role="tab" id="tab-events" data-view="events" aria-selected="false" aria-controls="view-events" type="button">Events</button>
</div>
<section id="view-keys" role="tabpanel" aria-labelledby="tab-keys">
<div class="card panel"><h2>Create an API key</h2><p class="sub">Use a key from your backend to create and validate sessions. The secret is shown only once.</p>
<form id="key-form" class="inline-form" novalidate><div class="field"><label for="key-name">Key name</label><input id="key-name" class="input" maxlength="120" autocomplete="off" placeholder="e.g. my-backend" required></div><button id="key-submit" class="btn btn-primary" type="submit" data-label="Create key"><span class="spinner" aria-hidden="true"></span><span class="label">Create key</span></button></form>
<div id="key-error" class="alert alert-error" role="alert" style="margin-top:12px"></div>
<div id="new-secret" class="secret" hidden><strong>Copy this key now. It will not be shown again.</strong><code id="new-secret-value"></code><div class="row"><button id="copy-secret" class="btn btn-primary btn-sm" type="button">Copy key</button><button id="dismiss-secret" class="btn btn-secondary btn-sm" type="button">I have saved it</button></div></div></div>
<div class="card panel"><h2>API keys</h2><ul id="key-list" class="list"></ul></div>
</section>
<section id="view-sessions" role="tabpanel" aria-labelledby="tab-sessions" hidden>
<div class="card panel"><h2>Application sessions</h2><p class="sub">Sessions created through the API. Revoking one makes its token fail validation immediately.</p><ul id="session-list" class="list"></ul></div>
</section>
<section id="view-events" role="tabpanel" aria-labelledby="tab-events" hidden>
<div class="card panel"><h2>Lifecycle events</h2><p class="sub">Redacted records of key and session changes, processed by the worker.</p><ul id="event-list" class="list"></ul></div>
</section>
</main>
<dialog id="confirm" aria-labelledby="confirm-title"><h2 id="confirm-title"></h2><p id="confirm-copy"></p><div id="confirm-error" class="alert alert-error" role="alert"></div><div class="dialog-actions"><button id="confirm-cancel" class="btn btn-secondary" type="button">Cancel</button><button id="confirm-ok" class="btn btn-danger-solid" type="button">Revoke</button></div></dialog>
<div id="toast" class="toast" role="status" hidden></div>`;

export const consolePage = renderPage({ title: "Console - AuthForge", page: "console", body, css, script: "/dashboard.js" });
