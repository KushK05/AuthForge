// Same-origin script for the landing, docs, and hosted auth pages. Served from /app.js.
export const publicClient = String.raw`(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var page = document.body.getAttribute("data-page");

  function api(path, options) {
    options = options || {};
    var init = { method: options.method || "GET", credentials: "same-origin", headers: {} };
    if (options.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    return fetch(path, init).then(function (response) {
      if (response.status === 204) return { ok: true, status: 204, data: null };
      return response.json().catch(function () { return null; }).then(function (data) {
        return { ok: response.ok, status: response.status, data: data };
      });
    }, function () { return { ok: false, status: 0, data: null }; });
  }

  function errorMessage(result) {
    if (result.status === 0) return "Could not reach the server. Check your connection and try again.";
    if (result.status === 429) return "Too many attempts, wait a minute and try again.";
    if (result.data && result.data.error && result.data.error.message) return result.data.error.message;
    return "Something went wrong. Please try again.";
  }

  function setBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle("is-busy", busy);
    button.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function setText(id, text) { var el = $(id); if (el) el.textContent = text || ""; }

  function fieldError(id, message) {
    setText(id + "-error", message);
    var input = $(id);
    if (!input) return;
    if (message) { input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", id + "-error"); }
    else { input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby"); }
  }

  function show(id) {
    ["state-form", "state-loading", "state-success", "state-failed", "state-done"].forEach(function (name) {
      var el = $(name);
      if (el) el.hidden = name !== id;
    });
    var shown = $(id);
    var heading = shown && shown.querySelector("h1");
    if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus(); }
  }

  function takeToken() {
    var params = new URLSearchParams(location.hash.slice(1));
    var token = params.get("token");
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    return token;
  }

  document.querySelectorAll(".toggle-pw").forEach(function (button) {
    button.addEventListener("click", function () {
      var input = $(button.getAttribute("data-target"));
      var reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.textContent = reveal ? "Hide" : "Show";
      button.setAttribute("aria-pressed", reveal ? "true" : "false");
    });
  });

  function validEmail(value) { return /^[^\s@]+@[^\s@]+$/.test(value); }

  function checkEmail(id) {
    var value = $(id).value.trim();
    if (!validEmail(value)) { fieldError(id, "Enter a valid email address."); return null; }
    fieldError(id, "");
    return value;
  }

  function checkPasswords() {
    var password = $("password").value;
    var ok = true;
    fieldError("password", "");
    if (password.length < 12) { fieldError("password", "Use at least 12 characters."); ok = false; }
    else if (password.length > 256) { fieldError("password", "Use at most 256 characters."); ok = false; }
    if ($("confirm")) {
      fieldError("confirm", "");
      if ($("confirm").value !== password) { fieldError("confirm", "Passwords do not match."); ok = false; }
    }
    return ok ? password : null;
  }

  function cooldown(button, seconds) {
    var label = button.querySelector(".label");
    var original = button.getAttribute("data-label");
    var remaining = seconds;
    button.disabled = true;
    var timer = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) { clearInterval(timer); button.disabled = false; label.textContent = original; return; }
      label.textContent = original + " (" + remaining + "s)";
    }, 1000);
    label.textContent = original + " (" + remaining + "s)";
  }

  // Landing and docs: swap the nav when signed in; keep legacy email links working.
  function setupNav() {
    api("/v1/auth/me").then(function (result) {
      if (!result.ok) return;
      document.querySelectorAll("[data-guest]").forEach(function (el) { el.hidden = true; });
      document.querySelectorAll("[data-user]").forEach(function (el) { el.hidden = false; });
    });
  }

  if (page === "landing" || page === "docs") {
    setupNav();
    document.querySelectorAll("[data-origin]").forEach(function (el) { el.textContent = location.origin; });
  }

  if (page === "landing" && location.hash) {
    var legacy = new URLSearchParams(location.hash.slice(1));
    var action = legacy.get("action");
    var legacyToken = legacy.get("token");
    if (legacyToken && (action === "verify-email" || action === "reset-password")) {
      location.replace("/" + action + "#token=" + encodeURIComponent(legacyToken));
    }
  }

  if (page === "docs") {
    document.querySelectorAll("[data-copy]").forEach(function (button) {
      button.addEventListener("click", function () {
        var text = button.closest(".codeblock").querySelector("pre").textContent;
        navigator.clipboard.writeText(text).then(function () {
          button.textContent = "Copied";
          setTimeout(function () { button.textContent = "Copy"; }, 1800);
        }, function () {
          button.textContent = "Copy failed";
          setTimeout(function () { button.textContent = "Copy"; }, 1800);
        });
      });
    });
    document.querySelectorAll("pre code").forEach(function (block) {
      block.textContent = block.textContent.split("<this deployment's origin>").join(location.origin);
    });
  }

  function submitHandler(handler) {
    var form = $("form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      setText("form-error", "");
      var button = $("submit");
      if (button.disabled) return;
      handler(button);
    });
  }

  if (page === "login") {
    api("/v1/auth/me").then(function (result) { if (result.ok) location.replace("/console"); });
    submitHandler(function (button) {
      var email = checkEmail("email");
      var password = $("password").value;
      fieldError("password", password ? "" : "Enter your password.");
      if (!email || !password) return;
      setBusy(button, true);
      api("/v1/auth/login", { method: "POST", body: { email: email, password: password } }).then(function (result) {
        if (result.ok) { location.assign("/console"); return; }
        setText("form-error", errorMessage(result));
        setBusy(button, false);
      });
    });
  }

  function resendVerification(email, button, status, errorBox) {
    setText(status, ""); setText(errorBox, "");
    setBusy(button, true);
    return api("/v1/auth/verification-email", { method: "POST", body: { email: email } }).then(function (result) {
      setBusy(button, false);
      if (result.ok) {
        setText(status, (result.data && result.data.message) || "If the account needs verification, a message has been sent to the demo inbox.");
        cooldown(button, 30);
      } else {
        setText(errorBox, errorMessage(result));
      }
    });
  }

  if (page === "signup") {
    var signupEmail = "";
    submitHandler(function (button) {
      var email = checkEmail("email");
      var password = checkPasswords();
      if (!email || !password) return;
      setBusy(button, true);
      api("/v1/auth/register", { method: "POST", body: { email: email, password: password } }).then(function (result) {
        setBusy(button, false);
        if (result.ok) {
          signupEmail = email;
          if (result.data && result.data.message) setText("done-message", result.data.message);
          show("state-done");
          cooldown($("resend-btn"), 30);
          return;
        }
        setText("form-error", errorMessage(result));
      });
    });
    $("resend-btn").addEventListener("click", function () {
      resendVerification(signupEmail, $("resend-btn"), "resend-status", "resend-error-box");
    });
  }

  if (page === "forgot-password") {
    submitHandler(function (button) {
      var email = checkEmail("email");
      if (!email) return;
      setBusy(button, true);
      api("/v1/auth/password-reset", { method: "POST", body: { email: email } }).then(function (result) {
        setBusy(button, false);
        if (result.ok) { show("state-done"); return; }
        setText("form-error", errorMessage(result));
      });
    });
  }

  if (page === "verify-email") {
    var verifyToken = takeToken();
    $("resend-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var email = checkEmail("resend-email");
      if (!email) return;
      resendVerification(email, $("resend"), "resend-ok", "resend-error");
    });
    if (!verifyToken) show("state-failed");
    else api("/v1/auth/verify-email", { method: "POST", body: { token: verifyToken } }).then(function (result) {
      show(result.ok ? "state-success" : "state-failed");
      if (!result.ok && result.status === 429) setText("resend-error", errorMessage(result));
    });
  }

  if (page === "reset-password") {
    var resetToken = takeToken();
    if (!resetToken) show("state-failed");
    submitHandler(function (button) {
      var password = checkPasswords();
      if (!password) return;
      setBusy(button, true);
      api("/v1/auth/password-reset/confirm", { method: "POST", body: { token: resetToken, password: password } }).then(function (result) {
        setBusy(button, false);
        if (result.ok) { show("state-success"); return; }
        if (result.status === 401 || result.status === 404) { show("state-failed"); return; }
        setText("form-error", errorMessage(result));
      });
    });
  }
})();
`;
