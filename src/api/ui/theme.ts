// Shared design system for every AuthForge page: tokens, components, and the page shell.

export const brandMark = `<svg class="mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="9" fill="var(--accent)"/><path d="M16 6.5 7.5 24.5h5l1.6-3.6h4.8l1.6 3.6h5L16 6.5Zm0 8.3 1.7 3.9h-3.4l1.7-3.9Z" fill="#fff"/></svg>`;

export const wordmark = (href = "/"): string =>
  `<a class="wordmark" href="${href}" aria-label="AuthForge home">${brandMark}<span>AuthForge</span></a>`;

export const themeCss = String.raw`
:root{--bg:#f6f7fb;--surface:#fff;--surface-2:#f1f3f9;--text:#111827;--muted:#4b5563;--border:#dfe3ec;--accent:#4f46e5;--accent-hover:#4338ca;--accent-soft:#eef0ff;--accent-text:#4338ca;--danger:#b42318;--danger-soft:#fef3f2;--success:#0f7a3d;--success-soft:#ecfdf3;--warn:#8a5a00;--warn-soft:#fff7e0;--ring:#4f46e5;--code-bg:#0f172a;--code-text:#e2e8f0;--code-muted:#94a3b8;--shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px rgba(16,24,40,.06);--r:10px;--r-lg:14px;--font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;--sidebar:#f7f8fa;--hover:#f3f4f7;--subtle:#6b7280;--border-soft:#ebedf2;--shadow-sm:0 1px 2px rgba(16,24,40,.05);--overlay:rgba(15,18,30,.45);color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0b0f1a;--surface:#131a2a;--surface-2:#1a2336;--text:#f1f5f9;--muted:#a3adc2;--border:#27324a;--accent:#4f46e5;--accent-hover:#6157f0;--accent-soft:#1c2150;--accent-text:#a5b4fc;--danger:#fda29b;--danger-soft:#3a1517;--success:#6ce9a6;--success-soft:#0f2a1c;--warn:#fec84b;--warn-soft:#2e2208;--ring:#a5b4fc;--code-bg:#080c16;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35);--sidebar:#0e1320;--hover:#1a2234;--subtle:#8b95ab;--border-soft:#1f2940;--shadow-sm:0 1px 2px rgba(0,0,0,.35);--overlay:rgba(2,4,10,.65);color-scheme:dark}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 var(--font);overflow-x:hidden;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{line-height:1.2;margin:0;letter-spacing:-.02em}
p{margin:0}
a{color:var(--accent-text);text-underline-offset:3px}
a:hover{text-decoration-thickness:2px}
code,pre,kbd{font-family:var(--mono)}
:focus{outline:none}
:focus-visible{outline:2px solid var(--ring);outline-offset:2px;border-radius:6px}
[hidden]{display:none!important}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.container{width:100%;max-width:1120px;margin:0 auto;padding:0 16px}
@media (min-width:640px){.container{padding:0 24px}}
.muted{color:var(--muted)}
.small{font-size:13.5px}
.wordmark{display:inline-flex;align-items:center;gap:10px;color:var(--text);font-weight:700;font-size:19px;letter-spacing:-.02em;text-decoration:none}
.wordmark:hover{text-decoration:none}
.mark{flex:none;display:block}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 16px;border:1px solid transparent;border-radius:var(--r);font:600 14.5px/1 var(--font);cursor:pointer;text-decoration:none;white-space:nowrap;transition:background .15s,border-color .15s}
.btn:hover{text-decoration:none}
.btn[disabled],.btn[aria-disabled="true"]{opacity:.6;cursor:not-allowed}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover:not([disabled]){background:var(--accent-hover)}
.btn-secondary{background:var(--surface);color:var(--text);border-color:var(--border)}
.btn-secondary:hover:not([disabled]){background:var(--surface-2)}
.btn-ghost{background:transparent;color:var(--text)}
.btn-ghost:hover:not([disabled]){background:var(--surface-2)}
.btn-danger{background:var(--surface);color:var(--danger);border-color:var(--border)}
.btn-danger:hover:not([disabled]){background:var(--danger-soft)}
.btn-danger-solid{background:#b42318;color:#fff}
.btn-danger-solid:hover:not([disabled]){background:#912018}
.btn-lg{min-height:48px;padding:0 22px;font-size:16px}
.btn-sm{min-height:32px;padding:0 12px;font-size:13px}
.btn-block{width:100%}
.spinner{display:none;width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite}
.is-busy .spinner{display:inline-block}
.spinner-lg{display:inline-block;width:32px;height:32px;border-width:3px;color:var(--accent-text)}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spinner{animation-duration:2s}}
.field{display:grid;gap:6px;margin-bottom:16px}
.field label{font-size:14px;font-weight:600}
.input{width:100%;min-height:44px;padding:0 12px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface);color:var(--text);font:16px var(--font)}
.input::placeholder{color:#7b8499}
.input:hover{border-color:#aab2c5}
.input:focus-visible{outline:2px solid var(--ring);outline-offset:1px;border-color:var(--ring)}
.input[aria-invalid="true"]{border-color:var(--danger)}
.pw{position:relative}
.pw .input{padding-right:64px}
.pw .toggle-pw{position:absolute;right:4px;top:4px;bottom:4px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--accent-text);font:600 13px var(--font);cursor:pointer}
.pw .toggle-pw:hover{background:var(--surface-2)}
.hint{font-size:13px;color:var(--muted)}
.field-error{font-size:13px;color:var(--danger);min-height:0}
.field-error:empty{display:none}
.alert{padding:10px 12px;border-radius:var(--r);border:1px solid;font-size:14px;margin-bottom:16px}
.alert:empty{display:none}
.alert-error{background:var(--danger-soft);color:var(--danger);border-color:var(--danger)}
.alert-info{background:var(--accent-soft);color:var(--text);border-color:var(--border)}
.alert-success{background:var(--success-soft);color:var(--success);border-color:var(--success)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow)}
.badge{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent-text);font-size:12.5px;font-weight:600}
.chip{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;background:var(--surface-2);color:var(--muted);border:1px solid var(--border)}
.chip-ok{background:var(--success-soft);color:var(--success);border-color:transparent}
.chip-off{background:var(--danger-soft);color:var(--danger);border-color:transparent}
.chip-warn{background:var(--warn-soft);color:var(--warn);border-color:transparent}
/* Top navigation */
.nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
.nav-inner{display:flex;align-items:center;gap:16px;min-height:64px}
.nav-links{display:none;gap:4px;margin-left:16px}
.nav-links a{padding:8px 12px;border-radius:8px;color:var(--muted);font-weight:500;font-size:15px;text-decoration:none}
.nav-links a:hover{background:var(--surface-2);color:var(--text)}
.nav-actions{margin-left:auto;display:flex;align-items:center;gap:8px}
@media (min-width:760px){.nav-links{display:flex}}
@media (max-width:420px){.nav-actions .btn-ghost{display:none}}
/* Footer */
.footer{border-top:1px solid var(--border);padding:32px 0;margin-top:80px;font-size:14px;color:var(--muted)}
.footer-inner{display:flex;flex-wrap:wrap;gap:16px 32px;align-items:center;justify-content:space-between}
.footer nav{display:flex;gap:20px;flex-wrap:wrap}
/* Code blocks */
.codeblock{position:relative;background:var(--code-bg);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin:12px 0 20px}
.codeblock .code-title{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 8px 14px;border-bottom:1px solid #1e293b;color:var(--code-muted);font:12px var(--mono)}
.codeblock pre{margin:0;padding:14px 16px;overflow-x:auto;color:var(--code-text);font-size:13px;line-height:1.65;tab-size:2}
.codeblock .copy{min-height:28px;padding:0 10px;border:1px solid #334155;border-radius:7px;background:transparent;color:#cbd5e1;font:600 12px var(--font);cursor:pointer}
.codeblock .copy:hover{background:#1e293b}
.tok-k{color:#a5b4fc}.tok-s{color:#86efac}.tok-c{color:#94a3b8}
.method{display:inline-block;min-width:58px;text-align:center;padding:3px 8px;border-radius:6px;font:700 12px var(--mono);letter-spacing:.02em;color:#fff}
.m-get{background:#0b6b8a}.m-post{background:#0f7a3d}.m-delete{background:#b42318}
`;

export interface PageOptions {
  title: string;
  description?: string;
  page: string;
  body: string;
  css?: string;
  script: string;
}

export const renderPage = (options: PageOptions): string =>
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="description" content="${options.description ?? "AuthForge hosted authentication demo"}"><title>${options.title}</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%234f46e5'/%3E%3C/svg%3E"><style>${themeCss}${options.css ?? ""}</style></head><body data-page="${options.page}">${options.body}<script src="${options.script}" defer></script></body></html>`;

export const footer = `<footer class="footer"><div class="container footer-inner"><div>${wordmark()}<p class="small" style="margin-top:8px">Temporary demo environment. Use synthetic @authforge.demo accounts only.</p></div><nav aria-label="Footer"><a href="/docs">Docs</a><a href="/signup">Create account</a><a href="/login">Sign in</a></nav></div></footer>`;

export const siteNav = (active?: "docs"): string =>
  `<header class="nav"><div class="container nav-inner">${wordmark()}<nav class="nav-links" aria-label="Primary"><a href="/#features">Features</a><a href="/#developers">Developers</a><a href="/docs"${active === "docs" ? ' aria-current="page"' : ""}>Docs</a></nav><div class="nav-actions"><span data-guest class="nav-actions" style="margin:0"><a class="btn btn-ghost" href="/login">Sign in</a><a class="btn btn-primary" href="/signup">Get started</a></span><a data-user hidden class="btn btn-primary" href="/console">Open console</a></div></div></header>`;
