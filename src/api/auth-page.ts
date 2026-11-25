export const authPage = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>AuthForge | Demo identity</title><style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#dbe8ed;background:#0b1720}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),radial-gradient(ellipse 48% 38% at 9% 92%,#1d536844,transparent),radial-gradient(ellipse 42% 40% at 88% 8%,#274e6644,transparent),#0b1720;background-size:56px 56px,56px 56px,auto,auto,auto}button,input{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid #77ced5;outline-offset:2px}.shell{width:min(1320px,100%);margin:auto;padding:30px 44px 44px}.nav{display:flex;align-items:center;justify-content:space-between;padding-bottom:26px;border-bottom:1px solid #2a3e49}.brand{display:flex;align-items:center;gap:11px;color:#eff7f8;font-size:18px;font-weight:760;letter-spacing:-.025em}.mark{width:32px;height:32px;display:grid;place-items:center;border-radius:7px;color:#15232a;background:#d8f26b;font-size:15px}.console-link{padding:9px 13px;border:1px solid #3a5561;border-radius:6px;color:#d7e6e9;text-decoration:none;font-size:13px;font-weight:650}.console-link:hover{border-color:#d8f26b;color:#d8f26b}.layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,420px);gap:clamp(40px,8vw,96px);align-items:center;min-height:calc(100vh - 132px)}.intro{position:relative;padding:42px 0 110px}.intro:after{content:"";position:absolute;width:min(460px,85vw);height:180px;bottom:0;left:0;background:radial-gradient(circle at 18px 138px,#d8f26b 0 5px,transparent 6px),radial-gradient(circle at 184px 76px,#77ced5 0 5px,transparent 6px),radial-gradient(circle at 351px 20px,#d8f26b 0 5px,transparent 6px),linear-gradient(146deg,transparent 0 28%,#416573 28.3% 28.7%,transparent 29% 53%,#416573 53.3% 53.7%,transparent 54% 100%);opacity:.8}.intro:before{content:"IDENTITY ROUTE / DEMO ENVIRONMENT";position:absolute;bottom:190px;left:0;color:#84a3ae;font:600 11px ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}h1{max-width:720px;margin:0;color:#f3f8f9;font-size:clamp(47px,5.5vw,76px);font-weight:620;letter-spacing:-.065em;line-height:.99}.lead{max-width:570px;margin:24px 0 36px;color:#9eb6bf;font-size:16px;line-height:1.65}.proof{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;max-width:660px}.proof div{border-top:1px solid #38515c;padding-top:12px;color:#8ea7b0;font-size:12px;line-height:1.5}.proof strong{display:block;margin-bottom:3px;color:#f3f8f9;font-size:14px;font-weight:650}.card{position:relative;padding:32px;border:1px solid #405661;border-radius:10px;background:#f4f7f6;color:#122631;box-shadow:24px 24px 0 #182c36}.eyebrow{color:#426873;font:700 11px ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}.card h2{margin:8px 0;font-size:29px;letter-spacing:-.045em;color:#122631}.card-copy{margin:0 0 22px;color:#5e747e;font-size:13px;line-height:1.55}.tabs{display:grid;grid-template-columns:1fr 1fr;margin-bottom:22px;border-bottom:1px solid #cad6d9}.tab{border:0;border-radius:0;background:transparent;padding:10px 5px;color:#718690;text-align:left;font-size:13px;font-weight:700}.tab[aria-pressed="true"]{box-shadow:inset 0 -2px #173f4c;color:#12323e}.form{display:grid;gap:15px}.field{display:grid;gap:7px}.field label{color:#2b4854;font-size:12px;font-weight:700}.field input{width:100%;border:1px solid #bdccd0;border-radius:5px;background:#fff;padding:13px;color:#1c3342}.field input:focus{border-color:#244f5d;box-shadow:0 0 0 3px #d7e8e7}.hint{color:#788b9a;font-size:11px;line-height:1.45}.password-wrap{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.password-toggle{min-width:64px;border:1px solid #bdccd0;border-radius:5px;background:#fff;padding:0 10px;color:#35535d;font-size:12px;font-weight:700}.submit{min-height:46px;border:0;border-radius:5px;background:#173f4c;padding:13px;color:#fff;font-weight:750}.submit:hover{background:#0d2d38}.submit:disabled{opacity:.65;cursor:wait}.secondary{justify-self:start;border:0;background:transparent;padding:2px 0;color:#315762;text-decoration:underline;text-underline-offset:3px;font-size:12px;font-weight:650}.error{min-height:19px;margin:0;color:#a43139;font-size:12px;line-height:1.45}.status{min-height:19px;margin:0;color:#236c48;font-size:12px;line-height:1.45}.pending{border-left:3px solid #d8f26b;padding:4px 0 4px 15px}.pending p{margin:8px 0 0;color:#4c6871;font-size:13px;line-height:1.55}.pending-actions{display:flex;flex-wrap:wrap;gap:18px;margin-top:16px}.account{display:grid;gap:16px}.account h2{margin:0}.account p{margin:0;color:#5e747e;font-size:13px;line-height:1.55}.account-card{border:1px solid #dce5ed;border-radius:6px;border-left:3px solid #d8f26b;background:#fff;padding:17px}.account-card strong{display:block;overflow-wrap:anywhere;font-size:15px}.account-card span{display:block;margin-top:4px;color:#647987;font-size:12px}.signout{justify-self:start;border:1px solid #d8c3c5;border-radius:5px;background:#fff;padding:9px 12px;color:#9b3f47;font-size:12px;font-weight:700}.notice{margin-top:17px;border-top:1px solid #d2dddf;padding-top:15px;color:#70808d;font-size:11px;line-height:1.55}[hidden]{display:none!important}@media(max-width:850px){.shell{padding:22px 24px 42px}.layout{grid-template-columns:minmax(0,1fr);gap:28px;padding-top:38px}.intro{padding:8px 0 48px}.intro:before,.intro:after{display:none}.proof{max-width:620px}.card{max-width:520px;width:100%}}@media(max-width:520px){.shell{padding:18px}.layout{gap:22px;padding-top:32px}.proof{grid-template-columns:minmax(0,1fr);gap:14px}.card{padding:23px;box-shadow:10px 10px 0 #182c36}h1{font-size:clamp(43px,13vw,54px)}.lead{margin:20px 0 24px}.password-wrap{grid-template-columns:minmax(0,1fr) 68px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}
</style></head><body><div class="shell"><nav class="nav"><div class="brand"><span class="mark">A</span>AuthForge</div><a class="console-link" href="/console">Developer console</a></nav><main class="layout"><section class="intro"><h1>Identity that feels ready for the real thing.</h1><p class="lead">Register a demo identity, verify it from the configured test inbox, and manage a short-lived hosted session.</p><div class="proof"><div><strong>Demo-only identities</strong>Only approved <code>@authforge.demo</code> addresses are accepted.</div><div><strong>Verified sign-in</strong>Email verification must finish before password sign-in works.</div><div><strong>Temporary by design</strong>All account data is deleted with the evaluation environment.</div></div></section><section class="card" aria-live="polite"><div id="auth-form"><div class="eyebrow">HOSTED IDENTITY</div><h2 id="form-title">Create your demo account</h2><p id="form-copy" class="card-copy">Use an approved demonstration email to get started.</p><div id="tabs" class="tabs" role="group" aria-label="Account access"><button class="tab" data-mode="register" aria-pressed="true" type="button">Create account</button><button class="tab" data-mode="login" aria-pressed="false" type="button">Sign in</button></div><form id="form" class="form" novalidate><div id="email-field" class="field"><label for="email">Demo email</label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="you@authforge.demo" required aria-describedby="email-hint error"><span id="email-hint" class="hint">Verification and reset links go to the configured test inbox.</span></div><div id="password-field" class="field"><label for="password" id="password-label">Password</label><div class="password-wrap"><input id="password" name="password" type="password" autocomplete="new-password" maxlength="256" aria-describedby="password-hint error"><button id="password-toggle" class="password-toggle" type="button" aria-label="Show password" aria-pressed="false">Show</button></div><span id="password-hint" class="hint">Use at least 12 characters.</span></div><button id="submit" class="submit" type="submit">Create account</button><button id="forgot-password" class="secondary" type="button">Forgot password?</button><p id="error" class="error" role="alert" aria-live="assertive"></p><p id="status" class="status" role="status" aria-live="polite"></p></form><div id="pending" class="pending" hidden><div class="eyebrow" id="pending-title">CHECK THE TEST INBOX</div><p id="pending-copy">If the account can be registered, a verification link has been sent.</p><div class="pending-actions"><button id="resend-verification" class="secondary" type="button">Resend verification email</button><button id="back-to-signin" class="secondary" type="button">Back to sign in</button></div><p id="pending-status" class="status" role="status" aria-live="polite"></p></div></div><div id="account" class="account" hidden><div class="eyebrow">SIGNED IN</div><h2>Your account is ready.</h2><p>Your hosted session is active. Return to the relying application to continue the demo.</p><div class="account-card"><strong id="account-email"></strong><span>Verified demo identity</span></div><p id="signout-error" class="error" role="status"></p><button id="signout" class="signout" type="button">Sign out</button></div><p class="notice">AuthForge is a temporary evaluation environment. Use synthetic demonstration details only.</p></section></main></div><script src="/auth.js" defer></script></body></html>`;

export const authClient = String.raw`(() => {
  let mode = "register", csrf = "", pendingEmail = "", actionToken = "";
  const $ = id => document.getElementById(id);
  const api = async (url, opts = {}) => {
    const headers = new Headers(opts.headers || {});
    if (opts.body) headers.set("content-type", "application/json");
    if (csrf && opts.method === "DELETE") headers.set("x-csrf-token", csrf);
    const response = await fetch(url, {...opts, headers, credentials: "same-origin", cache: "no-store"});
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error?.message || "Request failed. Try again."), {status: response.status});
    return data;
  };
  const account = user => {
    $("auth-form").hidden = true;
    $("account").hidden = false;
    $("account-email").textContent = user.email;
    $("signout-error").textContent = "";
  };
  const setMode = next => {
    mode = next;
    const formMode = mode === "register" || mode === "login";
    const hasEmail = mode === "register" || mode === "login" || mode === "reset-request";
    const hasPassword = mode === "register" || mode === "login" || mode === "reset-confirm";
    $("tabs").hidden = !formMode;
    $("email-field").hidden = !hasEmail;
    $("password-field").hidden = !hasPassword;
    $("forgot-password").hidden = mode !== "login";
    $("password-hint").hidden = mode === "login" || mode === "verify-email";
    $("password").required = mode === "register" || mode === "login" || mode === "reset-confirm";
    $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
    $("password-label").textContent = mode === "reset-confirm" ? "New password" : "Password";
    $("form-title").textContent = ({register:"Create your demo account",login:"Welcome back","verify-email":"Verify your email","reset-request":"Reset your password","reset-confirm":"Choose a new password"})[mode];
    $("form-copy").textContent = ({register:"Use an approved demonstration email to get started.",login:"Sign in to your verified demo account.","verify-email":"Confirm the one-time link sent to the configured test inbox.","reset-request":"Enter your demo email and we will send a reset link if the account is eligible.","reset-confirm":"Choose a new password for your demo account."})[mode];
    $("submit").textContent = ({register:"Create account",login:"Sign in","verify-email":"Verify email","reset-request":"Send reset link","reset-confirm":"Reset password"})[mode];
    $("error").textContent = "";
    $("status").textContent = "";
    document.querySelectorAll("[data-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
    document.title = mode === "login" ? "Sign in | AuthForge" : mode.startsWith("reset") ? "Reset password | AuthForge" : mode === "verify-email" ? "Verify email | AuthForge" : "Register | AuthForge";
  };
  const showPending = (title, message, email = "") => {
    $("form").hidden = true;
    $("pending").hidden = false;
    $("pending-title").textContent = title;
    $("pending-copy").textContent = message;
    $("resend-verification").hidden = !email;
    $("back-to-signin").hidden = false;
    $("pending-status").textContent = "";
    pendingEmail = email;
  };
  document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
    $("form").hidden = false; $("pending").hidden = true; setMode(button.dataset.mode);
  }));
  $("forgot-password").addEventListener("click", () => setMode("reset-request"));
  $("back-to-signin").addEventListener("click", () => {$("form").hidden=false;$("pending").hidden=true;setMode("login");$("email").focus();});
  $("password-toggle").addEventListener("click", () => {
    const show = $("password").type === "password";
    $("password").type = show ? "text" : "password";
    $("password-toggle").textContent = show ? "Hide" : "Show";
    $("password-toggle").setAttribute("aria-label", (show ? "Hide" : "Show") + " password");
    $("password-toggle").setAttribute("aria-pressed", String(show));
    $("password").focus();
  });
  $("form").addEventListener("submit", async event => {
    event.preventDefault();
    $("error").textContent = ""; $("status").textContent = "";
    const email = $("email").value.trim(), password = $("password").value;
    if ((mode === "register" || mode === "login" || mode === "reset-request") && !email) {$("error").textContent="Enter your demo email.";$("email").focus();return;}
    if ((mode === "register" || mode === "login" || mode === "reset-confirm") && password.length < 12) {$("error").textContent="Use a password with at least 12 characters.";$("password").focus();return;}
    const button = $("submit"), idleLabel = button.textContent;
    button.disabled = true; button.setAttribute("aria-busy", "true");
    button.textContent = mode === "register" ? "Creating account..." : mode === "login" ? "Signing in..." : mode === "verify-email" ? "Verifying..." : mode === "reset-confirm" ? "Resetting password..." : "Sending...";
    try {
      if (mode === "register") {
        await api("/v1/auth/register", {method:"POST",body:JSON.stringify({email,password})});
        $("password").value = "";
        showPending("CHECK THE TEST INBOX","If the account can be registered, a verification link has been sent to the configured test inbox.",email);
      } else if (mode === "login") {
        const data = await api("/v1/auth/login", {method:"POST",body:JSON.stringify({email,password})});
        csrf = data.csrf_token; $("password").value=""; account(data.user);
      } else if (mode === "verify-email") {
        const data = await api("/v1/auth/verify-email", {method:"POST",body:JSON.stringify({token:actionToken})});
        actionToken = ""; csrf = data.csrf_token; account(data.user);
      } else if (mode === "reset-request") {
        await api("/v1/auth/password-reset", {method:"POST",body:JSON.stringify({email})});
        showPending("CHECK THE TEST INBOX","If the account is eligible, a password reset link has been sent to the configured test inbox.");
      } else if (mode === "reset-confirm") {
        await api("/v1/auth/password-reset/confirm", {method:"POST",body:JSON.stringify({token:actionToken,password})});
        actionToken=""; $("password").value=""; $("form").hidden=false; $("pending").hidden=true; setMode("login"); $("email").value=email;
        $("status").textContent="Password reset. Sign in with your new password.";
      }
    } catch (error) { $("error").textContent = error.message; }
    finally {button.disabled=false;button.removeAttribute("aria-busy");button.textContent=idleLabel;}
  });
  $("resend-verification").addEventListener("click", async () => {
    const button = $("resend-verification"); button.disabled=true; button.setAttribute("aria-busy","true");
    try {await api("/v1/auth/verification-email",{method:"POST",body:JSON.stringify({email:pendingEmail})});$("pending-status").textContent="If the account needs verification, a new link has been sent.";}
    catch (error) {$("pending-status").textContent=error.message;}
    finally {button.disabled=false;button.removeAttribute("aria-busy");}
  });
  $("signout").addEventListener("click", async () => {
    const button=$("signout");button.disabled=true;button.setAttribute("aria-busy","true");
    try {await api("/v1/auth/session",{method:"DELETE"});csrf="";$("account").hidden=true;$("auth-form").hidden=false;$("form").hidden=false;$("email").value="";$("password").value="";setMode("login");$("email").focus();}
    catch (error) {$("signout-error").textContent=error.message;}
    finally {button.disabled=false;button.removeAttribute("aria-busy");}
  });
  const params = new URLSearchParams(window.location.hash.slice(1));
  const action = params.get("action"), token = params.get("token");
  if (action === "verify-email" || action === "reset-password") {
    actionToken = token || "";
    history.replaceState({}, "", window.location.pathname);
    setMode(action === "verify-email" ? "verify-email" : "reset-confirm");
    if (!actionToken) $("error").textContent="This link is invalid or expired. Request a new email link.";
  } else {
    api("/v1/auth/me").then(data => {csrf=data.csrf_token;account(data.user);}).catch(error => {if(error.status!==401)$("error").textContent=error.message;});
  }
})();`;
