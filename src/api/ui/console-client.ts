// Same-origin script for the developer console. Served from /dashboard.js.
// Server data is rendered only through textContent and createElement, never innerHTML.
export const consoleClient = String.raw`(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var csrf = "";
  var state = null;
  var sessionFilter = "all";
  var pendingAction = null;
  var lastFocus = null;
  var SECTIONS = { "overview": "Overview", "users": "Users", "api-keys": "API keys", "sessions": "Sessions", "events": "Events", "settings": "Authentication settings" };
  var EVENT_LABELS = {
    "showcase.api_key.created": "API key created",
    "showcase.api_key.revoked": "API key revoked",
    "showcase.session.created": "Session created",
    "showcase.session.revoked": "Session revoked",
    "showcase.test.failure": "Synthetic test failure"
  };

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
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  // ---- Time formatting ----
  var rtf = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;
  function relative(value) {
    if (!value) return "";
    var diff = (Date.parse(value) - Date.now()) / 1000;
    var abs = Math.abs(diff);
    var units = [["second", 60], ["minute", 3600], ["hour", 86400], ["day", 2592000], ["month", 31536000], ["year", Infinity]];
    var divisors = { second: 1, minute: 60, hour: 3600, day: 86400, month: 2592000, year: 31536000 };
    for (var i = 0; i < units.length; i++) {
      if (abs < units[i][1]) {
        var unit = units[i][0];
        if (unit === "second" && abs < 45) return diff < 0 ? "just now" : "in a few seconds";
        var n = Math.round(diff / divisors[unit]);
        return rtf ? rtf.format(n, unit) : new Date(value).toLocaleString();
      }
    }
    return new Date(value).toLocaleString();
  }
  function timeCell(value) {
    var cell = el("td", "muted-cell");
    var time = el("time", null, relative(value));
    time.setAttribute("datetime", value);
    time.title = new Date(value).toLocaleString();
    cell.appendChild(time);
    return cell;
  }

  // ---- Toasts ----
  function toast(text, kind) {
    var node = el("div", "toast" + (kind === "error" ? " is-error" : ""), text);
    $("toasts").appendChild(node);
    setTimeout(function () { node.remove(); }, 3200);
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle("is-busy", busy);
  }

  // ---- Small builders ----
  function status(text, kind) { return el("span", "status status-" + kind, text); }
  function td(content, className) {
    var cell = el("td", className || null);
    if (content instanceof Node) cell.appendChild(content); else cell.textContent = content;
    return cell;
  }
  function avatar(email, extra) {
    return el("span", "avatar" + (extra ? " " + extra : ""), (email || "?").charAt(0));
  }
  function emptyState(container, title, copy, actions) {
    container.textContent = "";
    var art = $("empty-art").content.cloneNode(true);
    container.appendChild(art);
    container.appendChild(el("h3", null, title));
    var p = el("p");
    copy.forEach(function (part) { p.appendChild(typeof part === "string" ? document.createTextNode(part) : part); });
    container.appendChild(p);
    if (actions && actions.length) {
      var row = el("div", "actions");
      actions.forEach(function (action) { row.appendChild(action); });
      container.appendChild(row);
    }
    container.hidden = false;
  }
  function link(href, text, className) {
    var a = el("a", className || null, text);
    a.href = href;
    return a;
  }
  function revokeButton(label, handler) {
    var button = el("button", "row-action", "Revoke");
    button.type = "button";
    button.setAttribute("aria-label", "Revoke " + label);
    button.addEventListener("click", function () { handler(button); });
    return button;
  }
  function fillTable(id, rows, emptyId, emptyFn) {
    var table = $(id);
    var tbody = table.tBodies[0];
    tbody.textContent = "";
    rows.forEach(function (row) { tbody.appendChild(row); });
    table.parentNode.hidden = rows.length === 0;
    var empty = $(emptyId);
    if (rows.length) { empty.hidden = true; empty.textContent = ""; } else emptyFn(empty);
  }
  function skeleton(id) {
    var table = $(id);
    var cols = table.tHead.rows[0].cells;
    var tbody = table.tBodies[0];
    tbody.textContent = "";
    for (var r = 0; r < 4; r++) {
      var tr = el("tr");
      tr.setAttribute("aria-hidden", "true");
      for (var c = 0; c < cols.length; c++) {
        var cell = el("td", cols[c].className || null);
        var bar = el("span", "sk");
        bar.style.width = (c === 0 ? 55 + ((r * 17) % 30) : 40 + ((r * 13 + c * 7) % 35)) + "%";
        cell.appendChild(bar);
        tr.appendChild(cell);
      }
      tbody.appendChild(tr);
    }
  }

  function sessionStatus(session, now) {
    if (session.revoked_at) return "revoked";
    return Date.parse(session.expires_at) <= now ? "expired" : "active";
  }

  // ---- Renderers ----
  function renderOverview(data, now) {
    var keys = data.api_keys, sessions = data.sessions, events = data.events, users = data.users;
    var verified = users.filter(function (u) { return u.email_verified; }).length;
    var activeKeys = keys.filter(function (k) { return !k.revoked_at; }).length;
    var activeSessions = sessions.filter(function (s) { return sessionStatus(s, now) === "active"; }).length;
    var delivered = events.filter(function (e) { return !!e.processed_at; }).length;
    $("m-users").textContent = users.length;
    $("m-users-sub").textContent = verified + " verified, " + (users.length - verified) + " pending";
    $("m-keys").textContent = activeKeys;
    $("m-keys-sub").textContent = keys.length - activeKeys + " revoked";
    $("m-sessions").textContent = activeSessions;
    $("m-sessions-sub").textContent = sessions.length + " total";
    $("m-events").textContent = events.length;
    $("m-events-sub").textContent = delivered + " delivered, " + (events.length - delivered) + " pending";

    var steps = [["step-key", keys.length > 0], ["step-session", sessions.length > 0]];
    var done = 0;
    steps.forEach(function (step) {
      var node = $(step[0]);
      node.classList.toggle("is-done", step[1]);
      node.querySelector(".step-dot").textContent = step[1] ? "✓" : step[0] === "step-key" ? "1" : "2";
      if (step[1]) done++;
    });
    $("progress-label").textContent = done + " of 2 done";
    $("progress-bar").style.width = (done / 2) * 100 + "%";

    var list = $("activity");
    list.textContent = "";
    events.slice(0, 5).forEach(function (event) {
      var item = el("li", "act");
      var dot = el("span", "act-dot " + (event.processed_at ? "is-ok" : "is-warn"));
      dot.title = event.processed_at ? "Delivered" : "Pending";
      item.appendChild(dot);
      var main = el("div", "act-main");
      main.appendChild(el("div", "act-title", EVENT_LABELS[event.event_type] || event.event_type));
      main.appendChild(el("div", "act-type", event.event_type));
      item.appendChild(main);
      var time = el("time", "act-time", relative(event.created_at));
      time.setAttribute("datetime", event.created_at);
      time.title = new Date(event.created_at).toLocaleString();
      item.appendChild(time);
      list.appendChild(item);
    });
    $("activity-empty").hidden = events.length > 0;
  }

  function renderUsers(data) {
    var query = $("user-search").value.trim().toLowerCase();
    var users = data.users.filter(function (u) { return !query || u.email.toLowerCase().indexOf(query) !== -1; });
    $("user-count").textContent = query ? users.length + " of " + data.users.length + " users" : data.users.length + (data.users.length === 1 ? " user" : " users");
    fillTable("user-table", users.map(function (user) {
      var tr = el("tr");
      var main = el("div", "cell-main");
      main.appendChild(avatar(user.email, "avatar-sm"));
      main.appendChild(el("span", "cell-title", user.email));
      tr.appendChild(td(main));
      tr.appendChild(td(status(user.email_verified ? "Verified" : "Pending", user.email_verified ? "ok" : "warn")));
      var created = timeCell(user.created_at);
      created.className += " hide-xs";
      tr.appendChild(created);
      return tr;
    }), "users-empty", function (empty) {
      if (query) emptyState(empty, "No matching users", ["No user email contains “" + query + "”."]);
      else emptyState(empty, "No users yet", ["Demo accounts appear here after someone signs up with an @authforge.demo address."], [link("/signup", "Open sign-up page", "btn btn-secondary btn-sm")]);
    });
  }

  function renderKeys(data) {
    fillTable("key-table", data.api_keys.map(function (key) {
      var revoked = !!key.revoked_at;
      var tr = el("tr");
      tr.setAttribute("data-key", key.id);
      tr.appendChild(td(el("span", "cell-title", key.name)));
      tr.appendChild(td(el("span", "pill-code", key.prefix + "••••"), "hide-xs"));
      var created = timeCell(key.created_at); created.className += " hide-sm"; tr.appendChild(created);
      tr.appendChild(td(status(revoked ? "Revoked" : "Active", revoked ? "off" : "ok")));
      tr.appendChild(td(revoked ? "" : revokeButton(key.name, function (button) {
        confirmRevoke("Revoke API key?", "Sessions created with “" + key.name + "” will stop validating immediately. This cannot be undone.", button, function () {
          return api("/v1/api-keys/" + encodeURIComponent(key.id), { method: "DELETE" });
        }, "API key revoked.");
      }), "end"));
      return tr;
    }), "keys-empty", function (empty) {
      var create = el("button", "btn btn-primary btn-sm", "Create API key");
      create.type = "button";
      create.addEventListener("click", openCreateKey);
      emptyState(empty, "No API keys yet", ["Create a key to let your backend create and validate sessions."], [create, link("/docs#quickstart", "Quickstart", "btn btn-secondary btn-sm")]);
    });
  }

  function renderSessions(data, now) {
    var names = {};
    data.api_keys.forEach(function (key) { names[key.id] = key.name; });
    var counts = { all: data.sessions.length, active: 0, ended: 0 };
    data.sessions.forEach(function (s) { if (sessionStatus(s, now) === "active") counts.active++; else counts.ended++; });
    $("f-all").textContent = counts.all; $("f-active").textContent = counts.active; $("f-ended").textContent = counts.ended;
    var rows = data.sessions.filter(function (s) {
      var st = sessionStatus(s, now);
      return sessionFilter === "all" || (sessionFilter === "active" ? st === "active" : st !== "active");
    });
    fillTable("session-table", rows.map(function (session) {
      var st = sessionStatus(session, now);
      var tr = el("tr");
      tr.setAttribute("data-session", session.id);
      tr.appendChild(td(el("span", "cell-title mono", session.subject)));
      tr.appendChild(td(names[session.api_key_id] || "Unknown key", "muted-cell hide-sm"));
      var created = timeCell(session.created_at); created.className += " hide-sm"; tr.appendChild(created);
      var expires = timeCell(session.expires_at); expires.className += " hide-xs"; tr.appendChild(expires);
      tr.appendChild(td(status(st === "active" ? "Active" : st === "expired" ? "Expired" : "Revoked", st === "active" ? "ok" : st === "expired" ? "warn" : "off")));
      tr.appendChild(td(st !== "active" ? "" : revokeButton(session.subject, function (button) {
        confirmRevoke("Revoke session?", "The token for “" + session.subject + "” will fail validation immediately.", button, function () {
          return api("/v1/console/sessions/" + encodeURIComponent(session.id), { method: "DELETE" });
        }, "Session revoked.");
      }), "end"));
      return tr;
    }), "sessions-empty", function (empty) {
      if (data.sessions.length) { emptyState(empty, "No sessions match this filter", ["Try another filter to see more sessions."]); return; }
      var code = el("code", null, "POST /v1/sessions");
      emptyState(empty, "No sessions yet", ["Your backend creates sessions by calling ", code, " with an API key."], [link("/docs#create-session", "How to create a session", "btn btn-secondary btn-sm")]);
    });
  }

  function renderEvents(data) {
    fillTable("event-table", data.events.map(function (event) {
      var tr = el("tr");
      var main = el("div");
      main.appendChild(el("div", "cell-title", EVENT_LABELS[event.event_type] || event.event_type));
      main.appendChild(el("div", "cell-sub mono", event.event_type));
      tr.appendChild(td(main));
      tr.appendChild(td(status(event.processed_at ? "Delivered" : "Pending", event.processed_at ? "ok" : "warn")));
      var created = timeCell(event.created_at); created.className += " hide-xs"; tr.appendChild(created);
      return tr;
    }), "events-empty", function (empty) {
      emptyState(empty, "No events yet", ["Creating or revoking keys and sessions records a lifecycle event here."]);
    });
  }

  function render() {
    if (!state) return;
    var now = Date.now();
    renderOverview(state, now);
    renderUsers(state);
    renderKeys(state);
    renderSessions(state, now);
    renderEvents(state);
  }

  function refresh() {
    return api("/v1/console/state").then(function (result) {
      if (!result.ok) { $("page-error").textContent = message(result); return; }
      $("page-error").textContent = "";
      var data = result.data || {};
      state = { api_keys: data.api_keys || [], sessions: data.sessions || [], events: data.events || [], users: data.users || [] };
      render();
    });
  }

  // ---- Routing ----
  function currentSection() {
    var hash = location.hash.replace(/^#/, "");
    return Object.prototype.hasOwnProperty.call(SECTIONS, hash) ? hash : "overview";
  }
  function route() {
    var section = currentSection();
    document.querySelectorAll("[data-view]").forEach(function (view) { view.hidden = view.getAttribute("data-view") !== section; });
    document.querySelectorAll(".nav-item[data-section]").forEach(function (item) {
      if (item.getAttribute("data-section") === section) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
    });
    $("crumb").textContent = SECTIONS[section];
    document.title = SECTIONS[section] + " - AuthForge Console";
    closeDrawer(false);
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  // ---- Mobile drawer ----
  function openDrawer() {
    $("sidebar").classList.add("is-open");
    $("backdrop").classList.add("is-open");
    $("menu-btn").setAttribute("aria-expanded", "true");
    $("sb-close").focus();
  }
  function closeDrawer(restore) {
    if (!$("sidebar").classList.contains("is-open")) return;
    $("sidebar").classList.remove("is-open");
    $("backdrop").classList.remove("is-open");
    $("menu-btn").setAttribute("aria-expanded", "false");
    if (restore) $("menu-btn").focus();
  }
  $("menu-btn").addEventListener("click", openDrawer);
  $("sb-close").addEventListener("click", function () { closeDrawer(true); });
  $("backdrop").addEventListener("click", function () { closeDrawer(true); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && $("sidebar").classList.contains("is-open")) closeDrawer(true);
  });
  document.querySelectorAll(".sb-nav a").forEach(function (a) { a.addEventListener("click", function () { closeDrawer(false); }); });

  // ---- Dialogs (native modal dialogs trap focus and close on Escape) ----
  function wireDialog(dialog, onClose) {
    dialog.addEventListener("cancel", function (event) { event.preventDefault(); onClose(); });
    dialog.addEventListener("click", function (event) { if (event.target === dialog) onClose(); });
  }
  function restoreFocus() { if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); lastFocus = null; }

  var confirmDialog = $("confirm");
  function confirmRevoke(title, copy, trigger, run, doneText) {
    lastFocus = trigger;
    $("confirm-title").textContent = title;
    $("confirm-copy").textContent = copy;
    $("confirm-error").textContent = "";
    pendingAction = { run: run, doneText: doneText };
    confirmDialog.showModal();
    $("confirm-cancel").focus();
  }
  function closeConfirm() {
    if ($("confirm-ok").disabled) return;
    pendingAction = null;
    if (confirmDialog.open) confirmDialog.close();
    restoreFocus();
  }
  $("confirm-cancel").addEventListener("click", closeConfirm);
  wireDialog(confirmDialog, closeConfirm);
  $("confirm-ok").addEventListener("click", function () {
    var action = pendingAction;
    if (!action) return;
    var button = $("confirm-ok");
    setBusy(button, true);
    action.run().then(function (result) {
      setBusy(button, false);
      if (!result.ok) { $("confirm-error").textContent = message(result); return; }
      pendingAction = null;
      confirmDialog.close();
      lastFocus = null;
      toast(action.doneText);
      refresh();
    });
  });

  var keyDialog = $("create-key");
  function openCreateKey(event) {
    lastFocus = event && event.currentTarget ? event.currentTarget : $("open-create-key");
    $("key-form").reset();
    $("key-error").textContent = "";
    $("key-name").removeAttribute("aria-invalid");
    keyDialog.showModal();
    $("key-name").focus();
  }
  function closeCreateKey() {
    if ($("key-submit").disabled) return;
    if (keyDialog.open) keyDialog.close();
    restoreFocus();
  }
  $("open-create-key").addEventListener("click", openCreateKey);
  $("key-cancel").addEventListener("click", closeCreateKey);
  wireDialog(keyDialog, closeCreateKey);
  $("key-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var name = $("key-name").value.trim();
    var button = $("key-submit");
    $("key-error").textContent = "";
    if (!name) { $("key-error").textContent = "Enter a name for the key."; $("key-name").setAttribute("aria-invalid", "true"); $("key-name").focus(); return; }
    $("key-name").removeAttribute("aria-invalid");
    setBusy(button, true);
    api("/v1/api-keys", { method: "POST", body: { name: name } }).then(function (result) {
      setBusy(button, false);
      if (!result.ok) { $("key-error").textContent = message(result); return; }
      keyDialog.close();
      lastFocus = null;
      $("new-secret-value").textContent = result.data.secret;
      $("new-secret").hidden = false;
      $("copy-secret").focus();
      toast("API key “" + name + "” created.");
      refresh();
    });
  });

  $("copy-secret").addEventListener("click", function () {
    navigator.clipboard.writeText($("new-secret-value").textContent).then(function () { toast("API key copied to the clipboard."); }, function () { toast("Copy failed. Select the key and copy it manually.", "error"); });
  });
  $("dismiss-secret").addEventListener("click", function () {
    $("new-secret-value").textContent = "";
    $("new-secret").hidden = true;
    $("open-create-key").focus();
  });

  // ---- Filters and search ----
  document.querySelectorAll("[data-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      sessionFilter = button.getAttribute("data-filter");
      document.querySelectorAll("[data-filter]").forEach(function (other) { other.setAttribute("aria-pressed", other === button ? "true" : "false"); });
      if (state) renderSessions(state, Date.now());
    });
  });
  $("user-search").addEventListener("input", function () { if (state) renderUsers(state); });

  $("signout").addEventListener("click", function () {
    var button = $("signout");
    button.disabled = true;
    api("/v1/auth/session", { method: "DELETE", noRedirect: true }).then(function () { redirectToLogin(); });
  });

  ["user-table", "key-table", "session-table", "event-table"].forEach(skeleton);
  route();

  api("/v1/auth/me").then(function (result) {
    if (!result.ok) { redirectToLogin(); return; }
    csrf = result.data.csrf_token;
    var email = result.data.user.email;
    $("user-email").textContent = email;
    $("user-email").title = email;
    $("user-avatar").textContent = email.charAt(0);
    $("app").hidden = false;
    refresh();
    setInterval(function () { if (state && !document.hidden) render(); }, 30000);
  });
})();
`;
