import { renderPage, wordmark } from "./theme.js";

const css = String.raw`
.auth-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px;background:radial-gradient(900px 400px at 50% -10%,var(--accent-soft),transparent 70%),var(--bg)}
.auth-brand{margin-bottom:24px}
.auth-card{width:100%;max-width:420px;padding:28px 24px}
@media (min-width:480px){.auth-card{padding:32px}}
.auth-card h1{font-size:24px;margin-bottom:6px}
.auth-card .subtitle{color:var(--muted);margin-bottom:24px;font-size:15px}
.auth-foot{margin-top:20px;text-align:center;font-size:14px;color:var(--muted)}
.auth-foot a{font-weight:600}
.auth-links{display:flex;justify-content:space-between;gap:12px;margin:-4px 0 16px;font-size:14px}
.auth-note{margin-top:16px;font-size:13px;color:var(--muted)}
.state{text-align:center}
.state .state-icon{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;margin:0 auto 16px;background:var(--accent-soft);color:var(--accent-text)}
.state .state-icon.ok{background:var(--success-soft);color:var(--success)}
.state .state-icon.bad{background:var(--danger-soft);color:var(--danger)}
.state h1{font-size:22px;margin-bottom:8px}
.state p{color:var(--muted);margin-bottom:20px;font-size:15px}
.state .stack{display:grid;gap:10px;text-align:left}
.state .stack .btn{width:100%}
.state form{text-align:left;margin-top:8px}
`;

const check = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>`;
const cross = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const mail = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`;

const submit = (label: string): string =>
  `<button id="submit" class="btn btn-primary btn-block" type="submit" data-label="${label}"><span class="spinner" aria-hidden="true"></span><span class="label">${label}</span></button>`;

const emailField = (id = "email", autocomplete = "email"): string =>
  `<div class="field"><label for="${id}">Email</label><input id="${id}" class="input" type="email" name="email" autocomplete="${autocomplete}" placeholder="you@authforge.demo" required spellcheck="false" autocapitalize="none"><div class="field-error" id="${id}-error"></div></div>`;

const passwordField = (id: string, label: string, autocomplete: string, hint = ""): string =>
  `<div class="field"><label for="${id}">${label}</label><div class="pw"><input id="${id}" class="input" type="password" name="${id}" autocomplete="${autocomplete}" required minlength="1" maxlength="256"><button type="button" class="toggle-pw" data-target="${id}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false">Show</button></div>${hint ? `<div class="hint">${hint}</div>` : ""}<div class="field-error" id="${id}-error"></div></div>`;

const shell = (page: string, title: string, inner: string, foot: string): string =>
  renderPage({
    title: `${title} - AuthForge`,
    page,
    css,
    script: "/app.js",
    body: `<main class="auth-wrap"><div class="auth-brand">${wordmark()}</div><div class="card auth-card">${inner}</div><p class="auth-foot">${foot}</p></main>`
  });

const stateBlock = (id: string, icon: string, kind: string, title: string, text: string, actions: string, hidden = true): string =>
  `<div id="${id}" class="state"${hidden ? " hidden" : ""}><div class="state-icon ${kind}">${icon}</div><h1>${title}</h1><p>${text}</p>${actions}</div>`;

const resendForm = (): string =>
  `<form id="resend-form" novalidate>${emailField("resend-email")}<div id="resend-error" class="alert alert-error" role="alert"></div><div id="resend-ok" class="alert alert-success" role="status"></div><button id="resend" class="btn btn-secondary btn-block" type="submit" data-label="Resend verification email"><span class="spinner" aria-hidden="true"></span><span class="label">Resend verification email</span></button></form>`;

export const signupPage = shell("signup", "Create account", `
<div id="state-form"><h1>Create your account</h1><p class="subtitle">Sign up for the AuthForge demo console.</p>
<form id="form" novalidate>
${emailField("email", "email")}
${passwordField("password", "Password", "new-password", "At least 12 characters.")}
${passwordField("confirm", "Confirm password", "new-password")}
<div id="form-error" class="alert alert-error" role="alert"></div>
${submit("Create account")}
<p class="auth-note">Only <code>@authforge.demo</code> addresses are accepted. The verification email is sent to the operator's demo inbox, not to the address you enter.</p>
</form></div>
${stateBlock("state-done", mail, "", "Check your inbox", `<span id="done-message">If the account can be registered, a verification email has been sent to the configured demo inbox.</span>`, `<div class="stack"><div id="resend-status" class="alert alert-info" role="status"></div><div id="resend-error-box" class="alert alert-error" role="alert"></div><button id="resend-btn" class="btn btn-secondary" type="button" data-label="Resend verification email"><span class="spinner" aria-hidden="true"></span><span class="label">Resend verification email</span></button><a class="btn btn-ghost" href="/login">Back to sign in</a></div>`)}
`, `Already have an account? <a href="/login">Sign in</a> &middot; <a href="/docs">Docs</a>`);

export const loginPage = shell("login", "Sign in", `
<h1>Welcome back</h1><p class="subtitle">Sign in to open the AuthForge console.</p>
<form id="form" novalidate>
${emailField("email", "email")}
${passwordField("password", "Password", "current-password")}
<div class="auth-links"><span></span><a href="/forgot-password">Forgot password?</a></div>
<div id="form-error" class="alert alert-error" role="alert"></div>
${submit("Sign in")}
</form>
`, `New to AuthForge? <a href="/signup">Create an account</a> &middot; <a href="/docs">Docs</a>`);

export const verifyEmailPage = shell("verify-email", "Verify email", `
<div id="state-loading" class="state" role="status"><div class="state-icon"><span class="spinner spinner-lg" style="display:inline-block" aria-hidden="true"></span></div><h1>Verifying your email</h1><p>One moment please.</p></div>
${stateBlock("state-success", check, "ok", "Email verified", "Email verified, you're signed in.", `<a class="btn btn-primary btn-block" href="/console">Open console</a>`)}
${stateBlock("state-failed", cross, "bad", "This link did not work", "The verification link is invalid, expired, or already used. Request a new one below.", resendForm())}
`, `<a href="/login">Back to sign in</a> &middot; <a href="/docs">Docs</a>`);

export const forgotPasswordPage = shell("forgot-password", "Reset password", `
<div id="state-form"><h1>Reset your password</h1><p class="subtitle">Enter your demo email and we will send a reset link.</p>
<form id="form" novalidate>
${emailField("email", "email")}
<div id="form-error" class="alert alert-error" role="alert"></div>
${submit("Send reset link")}
<p class="auth-note">Reset links go to the operator's demo inbox, never to the address you enter.</p>
</form></div>
${stateBlock("state-done", mail, "", "Check your inbox", "If the account is eligible, a reset email has been sent to the demo inbox. The link expires in 15 minutes.", `<a class="btn btn-secondary btn-block" href="/login">Back to sign in</a>`)}
`, `Remembered it? <a href="/login">Sign in</a> &middot; <a href="/docs">Docs</a>`);

export const resetPasswordPage = shell("reset-password", "Choose a new password", `
<div id="state-form"><h1>Choose a new password</h1><p class="subtitle">Pick a password you have not used for this demo before.</p>
<form id="form" novalidate>
${passwordField("password", "New password", "new-password", "At least 12 characters.")}
${passwordField("confirm", "Confirm new password", "new-password")}
<div id="form-error" class="alert alert-error" role="alert"></div>
${submit("Reset password")}
</form></div>
${stateBlock("state-success", check, "ok", "Password updated", "Your password has been reset. Sign in with the new password.", `<a class="btn btn-primary btn-block" href="/login">Go to sign in</a>`)}
${stateBlock("state-failed", cross, "bad", "This link did not work", "The reset link is invalid, expired, or already used.", `<a class="btn btn-primary btn-block" href="/forgot-password">Request a new link</a>`)}
`, `<a href="/login">Back to sign in</a> &middot; <a href="/docs">Docs</a>`);
