// Same-origin script for the developer console. Served from /dashboard.js.
export const consoleClient = String.raw`(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var csrf = "";
  var pendingAction = null;
  var lastFocus = null;

  function redirectToLogin() { location.replace("/login"); }

  function api(path, options) {
    options = options || {};
    var init = { method: options.method || "GET", credentials: "same-origin", headers: {} };
    if (options.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    if (init.method !== "GET") init.headers["X-CSRF-Token"] = csrf;
    return fetch(path, init).then(function (response) {
      if (response.status === 401 && !options.noRedirect) { redirectToLogin(); return new Promise(function () {}); }
      if (response.status === 204) return { ok: true, status: 204, data: null };
      return response.json().catch(function () { return null; }).then(function (data) {
        return { ok: response.ok, status: response.status, data: data };
      });
    }, function () { return { ok: false, status: 0, data: null }; });
  }

  function message(result) {
    if (result.status === 0) return "Could not reach the server.";
    if (result.data && result.data.error && result.data.error.message) return result.data.error.message;
    return "Something went wrong. Please try again.";
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function fmt(value) { return value ? new Date(value).toLocaleString() : ""; }

  function toast(text) {
    var node = $("toast");
    node.textContent = text;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.hidden = true; }, 2600);
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle("is-busy", busy);
  }

  function row(titleText, metaText, chips, action) {
    var item = el("li", "item");
    var main = el("div", "main");
    main.appendChild(el("div", "title", titleText));
    main.appendChild(el("div", "meta", metaText));
    item.appendChild(main);
    var side = el("div", "main");
    side.style.cssText = "display:flex;gap:8px;align-items:center;justify-content:flex-end;flex:0 0 auto";
    chips.forEach(function (chip) { side.appendChild(chip); });
    if (action) side.appendChild(action);
    item.appendChild(side);
    return item;
  }

  function chip(text, kind) { return el("span", "chip " + (kind || ""), text); }

  function empty(list, text) {
    list.appendChild(el("li", "empty", text));
  }

  function revokeButton(label, handler) {
    var button = el("button", "btn btn-danger btn-sm", "Revoke");
    button.type = "button";
    button.setAttribute("aria-label", "Revoke " + label);
    button.addEventListener("click", function () { handler(button); });
    return button;
  }

  function render(state) {
    var now = Date.now();
    var keys = state.api_keys || [];
    var sessions = state.sessions || [];
    var events = state.events || [];
    $("m-keys").textContent = keys.filter(function (k) { return !k.revoked_at; }).length;
    $("m-sessions").textContent = sessions.filter(function (s) { return !s.revoked_at && Date.parse(s.expires_at) > now; }).length;
    $("m-events").textContent = events.length;
    $("m-pending").textContent = events.filter(function (e) { return !e.processed_at; }).length;

    var keyList = $("key-list"); keyList.textContent = "";
    if (!keys.length) empty(keyList, "No API keys yet. Create one above.");
    keys.forEach(function (key) {
      var revoked = !!key.revoked_at;
      keyList.appendChild(row(key.name, key.prefix + "_... - created " + fmt(key.created_at),
        [chip(revoked ? "Revoked" : "Active", revoked ? "chip-off" : "chip-ok")],
        revoked ? null : revokeButton(key.name, function (button) {
          confirmRevoke("Revoke API key?", "Sessions created with " + key.name + " will stop validating. This cannot be undone.", button, function () {
            return api("/v1/api-keys/" + encodeURIComponent(key.id), { method: "DELETE" });
          }, "API key revoked.");
        })));
    });

    var sessionList = $("session-list"); sessionList.textContent = "";
    if (!sessions.length) empty(sessionList, "No sessions yet. Create one with the API.");
    sessions.forEach(function (session) {
      var revoked = !!session.revoked_at;
      var expired = !revoked && Date.parse(session.expires_at) <= now;
      var label = revoked ? "Revoked" : expired ? "Expired" : "Active";
      sessionList.appendChild(row(session.subject, "Expires " + fmt(session.expires_at) + " - created " + fmt(session.created_at),
        [chip(label, revoked ? "chip-off" : expired ? "chip-warn" : "chip-ok")],
        revoked || expired ? null : revokeButton(session.subject, function (button) {
          confirmRevoke("Revoke session?", "The token for " + session.subject + " will fail validation immediately.", button, function () {
            return api("/v1/console/sessions/" + encodeURIComponent(session.id), { method: "DELETE" });
          }, "Session revoked.");
        })));
    });

    var eventList = $("event-list"); eventList.textContent = "";
    if (!events.length) empty(eventList, "No events yet.");
    events.forEach(function (event) {
      var done = !!event.processed_at;
      eventList.appendChild(row(event.event_type, "Created " + fmt(event.created_at), [chip(done ? "Processed" : "Pending", done ? "chip-ok" : "chip-warn")], null));
    });
  }

  function refresh() {
    return api("/v1/console/state").then(function (result) {
      if (!result.ok) { $("page-error").textContent = message(result); return; }
      $("page-error").textContent = "";
      render(result.data);
    });
  }

  var dialog = $("confirm");
  function confirmRevoke(title, copy, trigger, run, doneText) {
    lastFocus = trigger;
    $("confirm-title").textContent = title;
    $("confirm-copy").textContent = copy;
    $("confirm-error").textContent = "";
    pendingAction = { run: run, doneText: doneText };
    dialog.showModal();
    $("confirm-cancel").focus();
  }
  function closeDialog() {
    pendingAction = null;
    if (dialog.open) dialog.close();
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  $("confirm-cancel").addEventListener("click", closeDialog);
  dialog.addEventListener("cancel", function (event) { event.preventDefault(); closeDialog(); });
  dialog.addEventListener("click", function (event) { if (event.target === dialog) closeDialog(); });
  $("confirm-ok").addEventListener("click", function () {
    var action = pendingAction;
    if (!action) return;
    var button = $("confirm-ok");
    setBusy(button, true);
    action.run().then(function (result) {
      setBusy(button, false);
      if (!result.ok) { $("confirm-error").textContent = message(result); return; }
      pendingAction = null;
      dialog.close();
      toast(action.doneText);
      refresh();
    });
  });

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (other) {
        var selected = other === tab;
        other.setAttribute("aria-selected", selected ? "true" : "false");
        $("view-" + other.getAttribute("data-view")).hidden = !selected;
      });
    });
  });

  $("key-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var name = $("key-name").value.trim();
    var button = $("key-submit");
    $("key-error").textContent = "";
    if (!name) { $("key-error").textContent = "Enter a name for the key."; return; }
    setBusy(button, true);
    api("/v1/api-keys", { method: "POST", body: { name: name } }).then(function (result) {
      setBusy(button, false);
      if (!result.ok) { $("key-error").textContent = message(result); return; }
      $("new-secret-value").textContent = result.data.secret;
      $("new-secret").hidden = false;
      $("key-name").value = "";
      refresh();
    });
  });

  $("copy-secret").addEventListener("click", function () {
    navigator.clipboard.writeText($("new-secret-value").textContent).then(function () { toast("API key copied to the clipboard."); }, function () { toast("Copy failed. Select the key and copy it manually."); });
  });
  $("dismiss-secret").addEventListener("click", function () {
    $("new-secret-value").textContent = "";
    $("new-secret").hidden = true;
  });

  $("signout").addEventListener("click", function () {
    var button = $("signout");
    setBusy(button, true);
    api("/v1/auth/session", { method: "DELETE", noRedirect: true }).then(function () { redirectToLogin(); });
  });

  api("/v1/auth/me").then(function (result) {
    if (!result.ok) { redirectToLogin(); return; }
    csrf = result.data.csrf_token;
    $("user-email").textContent = result.data.user.email;
    $("app").hidden = false;
    refresh();
  });
})();
`;
