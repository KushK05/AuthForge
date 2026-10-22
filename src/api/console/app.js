/**
 * AuthForge Developer Console - Frontend Application Controller
 * Handles operator authentication, CSRF token in memory, API key lifecycle,
 * synthetic session inspection, and interactive showcase playground.
 */

(() => {
  "use strict";

  // In-memory application state
  const state = {
    csrfToken: null,
    isAuthenticated: false,
    activeTab: "keys",
    apiKeys: [],
    sessions: [],
    pendingRevokeKey: null,
    healthInterval: null,
    refreshInterval: null
  };

  // DOM Elements Cache
  const els = {
    // Views
    viewLogin: document.getElementById("view-login"),
    viewDashboard: document.getElementById("view-dashboard"),

    // Header & Health
    healthPill: document.getElementById("system-health-pill"),
    healthLabel: document.getElementById("health-label"),
    operatorIndicator: document.getElementById("operator-indicator"),
    btnLogout: document.getElementById("btn-logout"),

    // Login Form
    formLogin: document.getElementById("form-login"),
    inputAccessCode: document.getElementById("input-access-code"),
    btnLoginSubmit: document.getElementById("btn-login-submit"),
    btnTogglePassword: document.getElementById("btn-toggle-password"),
    eyeShow: document.getElementById("eye-icon-show"),
    eyeHide: document.getElementById("eye-icon-hide"),
    loginAlert: document.getElementById("login-alert"),
    loginAlertMessage: document.getElementById("login-alert-message"),

    // Metrics
    metricActiveKeys: document.getElementById("metric-active-keys"),
    metricRevokedKeys: document.getElementById("metric-revoked-keys"),
    metricActiveSessions: document.getElementById("metric-active-sessions"),
    metricRevokedSessions: document.getElementById("metric-revoked-sessions"),
    badgeKeysCount: document.getElementById("badge-keys-count"),
    badgeSessionsCount: document.getElementById("badge-sessions-count"),

    // Tab buttons & Panes
    tabBtns: {
      keys: document.getElementById("tab-btn-keys"),
      sessions: document.getElementById("tab-btn-sessions"),
      playground: document.getElementById("tab-btn-playground"),
      blueprint: document.getElementById("tab-btn-blueprint")
    },
    tabPanes: {
      keys: document.getElementById("pane-keys"),
      sessions: document.getElementById("pane-sessions"),
      playground: document.getElementById("pane-playground"),
      blueprint: document.getElementById("pane-blueprint")
    },

    // Actions
    btnRefreshState: document.getElementById("btn-refresh-state"),
    refreshIcon: document.getElementById("refresh-icon"),
    btnOpenCreateKey: document.getElementById("btn-open-create-key"),

    // Tables
    keysTableBody: document.getElementById("keys-table-body"),
    keysEmptyState: document.getElementById("keys-empty-state"),
    sessionsTableBody: document.getElementById("sessions-table-body"),
    sessionsEmptyState: document.getElementById("sessions-empty-state"),

    // Modals
    modalCreateKey: document.getElementById("modal-create-key"),
    formCreateKey: document.getElementById("form-create-key"),
    inputKeyName: document.getElementById("input-key-name"),
    btnCancelCreateKey: document.getElementById("btn-cancel-create-key"),
    btnCloseCreateModal: document.getElementById("btn-close-create-modal"),
    btnSubmitCreateKey: document.getElementById("btn-submit-create-key"),

    modalRevealKey: document.getElementById("modal-reveal-key"),
    revealSecretText: document.getElementById("reveal-secret-text"),
    revealMetaName: document.getElementById("reveal-meta-name"),
    revealMetaId: document.getElementById("reveal-meta-id"),
    revealMetaPrefix: document.getElementById("reveal-meta-prefix"),
    btnCopyRevealedKey: document.getElementById("btn-copy-revealed-key"),
    btnCloseRevealModal: document.getElementById("btn-close-reveal-modal"),

    modalConfirmRevoke: document.getElementById("modal-confirm-revoke"),
    revokeKeyName: document.getElementById("revoke-key-name"),
    btnCancelRevoke: document.getElementById("btn-cancel-revoke"),
    btnCloseRevokeModal: document.getElementById("btn-close-revoke-modal"),
    btnConfirmRevokeKey: document.getElementById("btn-confirm-revoke-key"),

    // Playground
    formPlayCreate: document.getElementById("form-playground-create"),
    playApiKey: document.getElementById("play-api-key"),
    playSubject: document.getElementById("play-subject"),
    playTtl: document.getElementById("play-ttl"),
    playCreateResult: document.getElementById("play-create-result"),
    playCreatePreview: document.getElementById("play-create-preview"),
    btnCopySessionToken: document.getElementById("btn-copy-session-token"),

    formPlayValidate: document.getElementById("form-playground-validate"),
    playValKey: document.getElementById("play-val-key"),
    playValToken: document.getElementById("play-val-token"),
    playValidateResult: document.getElementById("play-validate-result"),
    playValidateStatusBadge: document.getElementById("play-validate-status-badge"),
    playValidatePreview: document.getElementById("play-validate-preview"),

    // Toast Container
    toastContainer: document.getElementById("toast-container")
  };

  let lastIssuedSessionToken = "";

  // ========================================================================
  // Notification Toast Helper
  // ========================================================================
  function showToast(title, description, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    const icon = type === "success" ? "✓" : "!";
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <div class="toast-title">${escapeHtml(title)}</div>
        ${description ? `<div class="toast-desc">${escapeHtml(description)}</div>` : ""}
      </div>
    `;

    els.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(12px) scale(0.95)";
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  // ========================================================================
  // HTTP Client (with in-memory CSRF & Origin Handling)
  // ========================================================================
  async function requestApi(endpoint, options = {}) {
    const method = options.method || "GET";
    const headers = {
      Accept: "application/json",
      ...(options.headers || {})
    };

    if (options.body && typeof options.body === "object") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }

    // Attach CSRF token on mutation methods when available
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase()) && state.csrfToken) {
      headers["X-CSRF-Token"] = state.csrfToken;
    }

    try {
      const response = await fetch(endpoint, {
        method,
        headers,
        credentials: "same-origin",
        body: options.body
      });

      let json = null;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        json = await response.json().catch(() => null);
      }

      if (response.status === 401 && state.isAuthenticated && endpoint.startsWith("/v1/console")) {
        // Console session has expired
        onSessionExpired();
        return { ok: false, status: response.status, data: null, error: json?.error || { message: "Session expired" } };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data: json,
          error: json?.error || { message: `Request failed (${response.status})` }
        };
      }

      return { ok: true, status: response.status, data: json, error: null };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: { message: err instanceof Error ? err.message : "Network error occurred" }
      };
    }
  }

  // ========================================================================
  // System Health Monitoring
  // ========================================================================
  async function checkHealth() {
    if (!els.healthPill) return;
    try {
      const res = await fetch("/health/ready", { cache: "no-store" });
      const dot = els.healthPill.querySelector(".status-dot");
      if (res.ok) {
        dot.className = "status-dot dot-healthy";
        els.healthLabel.textContent = "Cluster Ready (RDS + Redis)";
      } else {
        dot.className = "status-dot dot-unhealthy";
        els.healthLabel.textContent = "Cluster Degraded";
      }
    } catch {
      const dot = els.healthPill.querySelector(".status-dot");
      if (dot) dot.className = "status-dot dot-unhealthy";
      if (els.healthLabel) els.healthLabel.textContent = "Cluster Offline";
    }
  }

  // ========================================================================
  // Operator Authentication Flow
  // ========================================================================
  async function handleLogin(e) {
    e.preventDefault();
    hideLoginAlert();

    const accessCode = els.inputAccessCode.value.trim();
    if (!accessCode) {
      showLoginAlert("Please enter the operator access code.");
      return;
    }

    setButtonLoading(els.btnLoginSubmit, true);

    const res = await requestApi("/v1/console/session", {
      method: "POST",
      body: { access_code: accessCode }
    });

    setButtonLoading(els.btnLoginSubmit, false);

    if (!res.ok) {
      if (res.status === 429) {
        showLoginAlert("Rate limit exceeded. Too many failed attempts. Please wait.");
      } else {
        showLoginAlert("Invalid console access code. Timing-safe verification rejected.");
      }
      return;
    }

    // Success: store CSRF token in memory
    state.csrfToken = res.data.csrf_token;
    state.isAuthenticated = true;

    showToast("Operator Authenticated", "Console session established with HttpOnly cookie.");
    els.inputAccessCode.value = "";

    switchView("dashboard");
    await refreshDashboardState();
    startPeriodicRefresh();
  }

  async function handleLogout() {
    if (confirm("Revoke operator console session?")) {
      await requestApi("/v1/console/session", { method: "DELETE" });
      onSessionExpired();
      showToast("Session Ended", "Console session revoked.", "success");
    }
  }

  function onSessionExpired() {
    state.isAuthenticated = false;
    state.csrfToken = null;
    state.apiKeys = [];
    state.sessions = [];
    clearInterval(state.refreshInterval);
    switchView("login");
  }

  function switchView(viewName) {
    if (viewName === "dashboard") {
      els.viewLogin.classList.add("hidden");
      els.viewDashboard.classList.remove("hidden");
      els.operatorIndicator.classList.remove("hidden");
      els.btnLogout.classList.remove("hidden");
    } else {
      els.viewDashboard.classList.add("hidden");
      els.viewLogin.classList.remove("hidden");
      els.operatorIndicator.classList.add("hidden");
      els.btnLogout.classList.add("hidden");
      els.inputAccessCode.focus();
    }
  }

  function showLoginAlert(msg) {
    els.loginAlertMessage.textContent = msg;
    els.loginAlert.classList.remove("hidden");
  }

  function hideLoginAlert() {
    els.loginAlert.classList.add("hidden");
  }

  // ========================================================================
  // Dashboard State & Tab Management
  // ========================================================================
  async function refreshDashboardState() {
    els.refreshIcon.style.animation = "spin 0.6s linear";
    setTimeout(() => { els.refreshIcon.style.animation = ""; }, 600);

    const res = await requestApi("/v1/console/state");
    if (!res.ok) return;

    state.apiKeys = res.data.api_keys || [];
    state.sessions = res.data.sessions || [];

    renderMetrics();
    renderKeysTable();
    renderSessionsTable();
  }

  function startPeriodicRefresh() {
    clearInterval(state.refreshInterval);
    state.refreshInterval = setInterval(() => {
      if (state.isAuthenticated) {
        refreshDashboardState();
      }
    }, 10000);
  }

  function renderMetrics() {
    const activeKeys = state.apiKeys.filter(k => !k.revoked_at);
    const revokedKeys = state.apiKeys.filter(k => k.revoked_at);
    const now = new Date();
    const activeSessions = state.sessions.filter(s => !s.revoked_at && new Date(s.expires_at) > now);
    const inactiveSessions = state.sessions.filter(s => s.revoked_at || new Date(s.expires_at) <= now);

    els.metricActiveKeys.textContent = activeKeys.length.toString();
    els.metricRevokedKeys.textContent = `${revokedKeys.length} revoked`;
    els.badgeKeysCount.textContent = state.apiKeys.length.toString();

    els.metricActiveSessions.textContent = activeSessions.length.toString();
    els.metricRevokedSessions.textContent = `${inactiveSessions.length} revoked/expired`;
    els.badgeSessionsCount.textContent = state.sessions.length.toString();
  }

  function switchTab(tabKey) {
    state.activeTab = tabKey;
    Object.keys(els.tabBtns).forEach(k => {
      const btn = els.tabBtns[k];
      const pane = els.tabPanes[k];
      const isActive = k === tabKey;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      pane.classList.toggle("hidden", !isActive);
      pane.classList.toggle("active", isActive);
    });
  }

  // ========================================================================
  // API Keys Table & Lifecycle Actions
  // ========================================================================
  function renderKeysTable() {
    els.keysTableBody.innerHTML = "";

    if (state.apiKeys.length === 0) {
      els.keysEmptyState.classList.remove("hidden");
      return;
    }

    els.keysEmptyState.classList.add("hidden");

    state.apiKeys.forEach(key => {
      const tr = document.createElement("tr");
      const isRevoked = Boolean(key.revoked_at);

      tr.innerHTML = `
        <td>
          <strong>${escapeHtml(key.name)}</strong>
        </td>
        <td>
          <span class="chip-code">${escapeHtml(key.prefix)}</span>
        </td>
        <td>
          <span class="badge-status ${isRevoked ? "badge-revoked" : "badge-active"}">
            ${isRevoked ? "Revoked" : "Active"}
          </span>
        </td>
        <td class="font-mono">${formatDate(key.created_at)}</td>
        <td class="font-mono">${key.revoked_at ? formatDate(key.revoked_at) : "<span class='text-faint'>—</span>"}</td>
        <td class="text-right">
          ${isRevoked
            ? "<span class='text-faint font-mono text-sm'>Revoked</span>"
            : `<button type="button" class="btn btn-danger btn-sm btn-action-revoke" data-key-id="${escapeHtml(key.id)}" data-key-name="${escapeHtml(key.name)}">Revoke</button>`
          }
        </td>
      `;

      els.keysTableBody.appendChild(tr);
    });

    // Wire up revoke buttons
    els.keysTableBody.querySelectorAll(".btn-action-revoke").forEach(btn => {
      btn.addEventListener("click", () => {
        openRevokeConfirmModal(btn.dataset.keyId, btn.dataset.keyName);
      });
    });
  }

  async function handleCreateKey(e) {
    e.preventDefault();
    const name = els.inputKeyName.value.trim();
    if (!name) return;

    setButtonLoading(els.btnSubmitCreateKey, true);

    const res = await requestApi("/v1/api-keys", {
      method: "POST",
      body: { name }
    });

    setButtonLoading(els.btnSubmitCreateKey, false);

    if (!res.ok) {
      showToast("Creation Failed", res.error.message, "danger");
      return;
    }

    closeModal(els.modalCreateKey);
    els.inputKeyName.value = "";

    // Open one-time reveal modal
    openRevealModal(res.data);
    await refreshDashboardState();
    showToast("API Key Generated", "Copy the raw secret key immediately.");
  }

  function openRevealModal(data) {
    els.revealSecretText.textContent = data.secret;
    els.revealMetaName.textContent = data.name;
    els.revealMetaId.textContent = data.id;
    els.revealMetaPrefix.textContent = data.prefix;

    // Also prefill the playground with this new key for quick demonstration!
    els.playApiKey.value = data.secret;
    els.playValKey.value = data.secret;

    openModal(els.modalRevealKey);
  }

  function openRevokeConfirmModal(keyId, keyName) {
    state.pendingRevokeKey = { id: keyId, name: keyName };
    els.revokeKeyName.textContent = keyName;
    openModal(els.modalConfirmRevoke);
  }

  async function handleConfirmRevokeKey() {
    if (!state.pendingRevokeKey) return;
    setButtonLoading(els.btnConfirmRevokeKey, true);

    const res = await requestApi(`/v1/api-keys/${encodeURIComponent(state.pendingRevokeKey.id)}`, {
      method: "DELETE"
    });

    setButtonLoading(els.btnConfirmRevokeKey, false);
    closeModal(els.modalConfirmRevoke);

    if (!res.ok) {
      showToast("Revocation Failed", res.error.message, "danger");
      return;
    }

    showToast("Key Revoked", `Revoked ${state.pendingRevokeKey.name} and all associated sessions.`);
    state.pendingRevokeKey = null;
    await refreshDashboardState();
  }

  // ========================================================================
  // Synthetic Sessions Table & Actions
  // ========================================================================
  function renderSessionsTable() {
    els.sessionsTableBody.innerHTML = "";

    if (state.sessions.length === 0) {
      els.sessionsEmptyState.classList.remove("hidden");
      return;
    }

    els.sessionsEmptyState.classList.add("hidden");

    const now = new Date();

    state.sessions.forEach(sess => {
      const isRevoked = Boolean(sess.revoked_at);
      const isExpired = !isRevoked && new Date(sess.expires_at) <= now;
      let statusClass = "badge-active";
      let statusText = "Active";

      if (isRevoked) {
        statusClass = "badge-revoked";
        statusText = "Revoked";
      } else if (isExpired) {
        statusClass = "badge-expired";
        statusText = "Expired";
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <span class="chip-uuid" title="${escapeHtml(sess.id)}">
            ${escapeHtml(sess.id.slice(0, 8))}...${escapeHtml(sess.id.slice(-4))}
          </span>
          <button type="button" class="btn-copy-result btn-copy-inline" data-copy="${escapeHtml(sess.id)}" title="Copy full ID">Copy</button>
        </td>
        <td>
          <span class="chip-uuid" title="${escapeHtml(sess.api_key_id)}">
            ${escapeHtml(sess.api_key_id.slice(0, 8))}...
          </span>
        </td>
        <td>
          <span class="chip-code">${escapeHtml(sess.subject)}</span>
        </td>
        <td>
          <span class="badge-status ${statusClass}">${statusText}</span>
        </td>
        <td class="font-mono">${formatDate(sess.created_at)}</td>
        <td class="font-mono">${formatDate(sess.expires_at)}</td>
        <td class="text-right">
          ${!isRevoked && !isExpired
            ? `<button type="button" class="btn btn-danger btn-sm btn-revoke-session" data-session-id="${escapeHtml(sess.id)}">Revoke</button>`
            : "<span class='text-faint font-mono text-sm'>Closed</span>"
          }
        </td>
      `;

      els.sessionsTableBody.appendChild(tr);
    });

    // Wire up session revoke buttons
    els.sessionsTableBody.querySelectorAll(".btn-revoke-session").forEach(btn => {
      btn.addEventListener("click", () => handleRevokeSession(btn.dataset.sessionId));
    });

    // Wire up inline copy buttons
    els.sessionsTableBody.querySelectorAll(".btn-copy-inline").forEach(btn => {
      btn.addEventListener("click", () => copyToClipboard(btn.dataset.copy, "Session ID copied"));
    });
  }

  async function handleRevokeSession(sessionId) {
    if (!confirm("Revoke this application session?")) return;

    const res = await requestApi(`/v1/console/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE"
    });

    if (!res.ok) {
      showToast("Revocation Failed", res.error.message, "danger");
      return;
    }

    showToast("Session Revoked", "The synthetic session has been revoked.");
    await refreshDashboardState();
  }

  // ========================================================================
  // Interactive Showcase Playground
  // ========================================================================
  async function handlePlaygroundCreate(e) {
    e.preventDefault();
    const apiKey = els.playApiKey.value.trim();
    const subject = els.playSubject.value.trim();
    const ttl = parseInt(els.playTtl.value, 10);

    if (!apiKey) {
      showToast("API Key Required", "Paste an active demonstration API key.", "danger");
      return;
    }

    const btn = document.getElementById("btn-play-create");
    setButtonLoading(btn, true);

    const res = await requestApi("/v1/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: { subject, ttl_seconds: ttl }
    });

    setButtonLoading(btn, false);

    if (!res.ok) {
      els.playCreateResult.classList.remove("hidden");
      els.playCreatePreview.textContent = JSON.stringify(res.data || res.error, null, 2);
      showToast("Session Creation Failed", res.error.message, "danger");
      return;
    }

    lastIssuedSessionToken = res.data.token;
    els.playCreateResult.classList.remove("hidden");
    els.playCreatePreview.textContent = JSON.stringify(res.data, null, 2);

    // Auto-populate Step 2 for immediate evaluation convenience!
    els.playValKey.value = apiKey;
    els.playValToken.value = res.data.token;

    showToast("Session Created", "Synthetic session issued. Ready for validation.");
    await refreshDashboardState();
  }

  async function handlePlaygroundValidate(e) {
    e.preventDefault();
    const apiKey = els.playValKey.value.trim();
    const token = els.playValToken.value.trim();

    if (!apiKey || !token) {
      showToast("Missing Parameters", "API key and token are required for validation.", "danger");
      return;
    }

    const btn = document.getElementById("btn-play-validate");
    setButtonLoading(btn, true);

    const res = await requestApi("/v1/sessions/validate", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: { token }
    });

    setButtonLoading(btn, false);
    els.playValidateResult.classList.remove("hidden");

    if (res.ok) {
      els.playValidateStatusBadge.className = "result-tag tag-success";
      els.playValidateStatusBadge.textContent = "200 VALID";
      els.playValidatePreview.textContent = JSON.stringify(res.data, null, 2);
      showToast("Token Valid", "Cryptographic digest match and session active.");
    } else {
      els.playValidateStatusBadge.className = "result-tag tag-error";
      els.playValidateStatusBadge.textContent = `${res.status} INVALID`;
      els.playValidatePreview.textContent = JSON.stringify(res.data || res.error, null, 2);
      showToast("Validation Rejected", res.error.message, "danger");
    }
  }

  // ========================================================================
  // Modals & General UI Utilities
  // ========================================================================
  function openModal(modal) {
    modal.classList.remove("hidden");
  }

  function closeModal(modal) {
    modal.classList.add("hidden");
  }

  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    const spinner = btn.querySelector(".btn-spinner");
    const text = btn.querySelector(".btn-text");
    if (spinner) spinner.classList.toggle("hidden", !isLoading);
    if (text) text.style.opacity = isLoading ? "0.7" : "1";
  }

  function copyToClipboard(text, successMsg = "Copied to clipboard") {
    if (!navigator.clipboard) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showToast("Copied", successMsg);
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => showToast("Copied", successMsg),
      () => showToast("Copy Failed", "Please copy manually", "danger")
    );
  }

  function formatDate(isoString) {
    if (!isoString) return "—";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
      " " + d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str.replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[m]);
  }

  // ========================================================================
  // Initialization & Event Listeners
  // ========================================================================
  function init() {
    // Password visibility toggle
    els.btnTogglePassword.addEventListener("click", () => {
      const isPass = els.inputAccessCode.type === "password";
      els.inputAccessCode.type = isPass ? "text" : "password";
      els.eyeShow.classList.toggle("hidden", isPass);
      els.eyeHide.classList.toggle("hidden", !isPass);
    });

    // Form events
    els.formLogin.addEventListener("submit", handleLogin);
    els.btnLogout.addEventListener("click", handleLogout);
    els.btnRefreshState.addEventListener("click", refreshDashboardState);

    // Tab clicks
    Object.keys(els.tabBtns).forEach(k => {
      els.tabBtns[k].addEventListener("click", () => switchTab(k));
    });

    // Create Key Modal events
    els.btnOpenCreateKey.addEventListener("click", () => {
      openModal(els.modalCreateKey);
      els.inputKeyName.focus();
    });
    els.btnCloseCreateModal.addEventListener("click", () => closeModal(els.modalCreateKey));
    els.btnCancelCreateKey.addEventListener("click", () => closeModal(els.modalCreateKey));
    els.formCreateKey.addEventListener("submit", handleCreateKey);

    // Reveal Key Modal events
    els.btnCloseRevealModal.addEventListener("click", () => closeModal(els.modalRevealKey));
    els.btnCopyRevealedKey.addEventListener("click", () => {
      copyToClipboard(els.revealSecretText.textContent, "API secret copied to clipboard");
    });

    // Revoke Confirm Modal events
    els.btnCancelRevoke.addEventListener("click", () => closeModal(els.modalConfirmRevoke));
    els.btnCloseRevokeModal.addEventListener("click", () => closeModal(els.modalConfirmRevoke));
    els.btnConfirmRevokeKey.addEventListener("click", handleConfirmRevokeKey);

    // Playground forms
    els.formPlayCreate.addEventListener("submit", handlePlaygroundCreate);
    els.formPlayValidate.addEventListener("submit", handlePlaygroundValidate);
    els.btnCopySessionToken.addEventListener("click", () => {
      if (lastIssuedSessionToken) {
        copyToClipboard(lastIssuedSessionToken, "Session token copied to clipboard");
      }
    });

    // Backdrop click dismiss for modals
    [els.modalCreateKey, els.modalRevealKey, els.modalConfirmRevoke].forEach(modal => {
      modal.addEventListener("click", e => {
        if (e.target === modal) closeModal(modal);
      });
    });

    // Health monitoring
    checkHealth();
    state.healthInterval = setInterval(checkHealth, 8000);

    // Initial check: if operator already has a valid cookie, auto-open dashboard
    requestApi("/v1/console/state").then(res => {
      if (res.ok) {
        state.isAuthenticated = true;
        switchView("dashboard");
        state.apiKeys = res.data.api_keys || [];
        state.sessions = res.data.sessions || [];
        renderMetrics();
        renderKeysTable();
        renderSessionsTable();
        startPeriodicRefresh();
      }
    });
  }

  // Run on DOM Ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
