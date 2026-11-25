import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({status, contentType: "application/json", headers, body: JSON.stringify(body)});
const signedOut = () => json({error: {code: "invalid_user_credentials", message: "Invalid demo email or password.", request_id: "req_test"}}, 401);
const cookie = {"set-cookie": "authforge_user=browser-user; Path=/; HttpOnly; SameSite=Strict"};

/** Mocks the hosted-auth endpoints with a tiny signed-in flag. */
const mockAuth = async (page: Page, email: string, initiallySignedIn = false) => {
  const state = {signedIn: initiallySignedIn};
  await page.route("**/v1/auth/me", route => route.fulfill(state.signedIn ? json({user: {id: "demo-user", email}, csrf_token: "test-csrf"}) : signedOut()));
  await page.route("**/v1/auth/login", route => { state.signedIn = true; return route.fulfill(json({user: {id: "demo-user", email}, csrf_token: "test-csrf"}, 200, cookie)); });
  await page.route("**/v1/auth/verify-email", route => { state.signedIn = true; return route.fulfill(json({user: {id: "demo-user", email}, csrf_token: "test-csrf"}, 200, cookie)); });
  await page.route("**/v1/auth/session", route => {
    const headers = route.request().headers();
    const ok = route.request().method() === "DELETE" && headers["x-csrf-token"] === "test-csrf";
    if (ok) state.signedIn = false;
    return route.fulfill(ok ? {status: 204, headers: {"set-cookie": "authforge_user=; Path=/; Max-Age=0"}} : json({error: {code: "invalid_csrf", message: "CSRF validation failed", request_id: "req_test"}}, 403));
  });
  return state;
};

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("landing page presents the product and offers sign-up and sign-in", async ({page}) => {
  await mockAuth(page, "someone@authforge.demo");
  await page.goto("/");
  await expect(page.getByRole("heading", {level: 1})).toContainText("Authentication");
  await expect(page.getByRole("link", {name: "Get started"}).first()).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", {name: "Sign in"}).first()).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", {name: "Docs"}).first()).toHaveAttribute("href", "/docs");
  await expect(page.getByText("Temporary demo environment").first()).toBeVisible();
  for (const width of [1280, 375, 360]) {
    await page.setViewportSize({width, height: 800});
    expect(await noHorizontalScroll(page)).toBe(true);
  }
});

test("landing nav shows Open console when signed in", async ({page}) => {
  await mockAuth(page, "someone@authforge.demo", true);
  await page.goto("/");
  await expect(page.getByRole("link", {name: "Open console"})).toBeVisible();
  await expect(page.locator("header").getByRole("link", {name: "Get started"})).toBeHidden();
});

test("legacy email links on the landing page redirect to the dedicated pages", async ({page}) => {
  await mockAuth(page, "someone@authforge.demo");
  await page.route("**/v1/auth/verify-email", route => route.fulfill(json({error: {code: "invalid_credentials", message: "Authentication failed", request_id: "req_test"}}, 401)));
  await page.goto("/#action=verify-email&token=verify_legacytoken");
  await expect(page).toHaveURL(/\/verify-email$/);
  await page.goto("/#action=reset-password&token=reset_legacytoken");
  await expect(page).toHaveURL(/\/reset-password$/);
});

test("sign-up shows the check-your-inbox state and resend cooldown", async ({page}) => {
  const email = `${randomUUID()}@authforge.demo`;
  const requests: string[] = [];
  await page.route("**/v1/auth/register", route => { requests.push(route.request().postData() ?? ""); return route.fulfill(json({message: "If the account can be registered, a verification email has been sent to the configured demo inbox."}, 202)); });
  await page.route("**/v1/auth/verification-email", route => route.fulfill(json({message: "If the account needs verification, a message has been sent to the configured demo inbox."}, 202)));
  await page.goto("/signup");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("a-demo-password-123");
  await page.locator("#confirm").fill("different-password-123");
  await page.locator("#submit").click();
  await expect(page.locator("#confirm-error")).toContainText("do not match");
  expect(requests).toEqual([]);
  await page.locator("#confirm").fill("a-demo-password-123");
  await page.locator("#submit").click();
  await expect(page.getByRole("heading", {name: "Check your inbox"})).toBeVisible();
  await expect(page.locator("#done-message")).toContainText("configured demo inbox");
  await expect(page.locator("#resend-btn")).toBeDisabled();
  expect(JSON.parse(requests[0]!)).toEqual({email, password: "a-demo-password-123"});
});

test("sign-up page rejects short passwords and works at 360px", async ({page}) => {
  await page.setViewportSize({width: 360, height: 740});
  await page.goto("/signup");
  await page.locator("#email").fill("someone@authforge.demo");
  await page.locator("#password").fill("short");
  await page.locator("#confirm").fill("short");
  await page.locator("#submit").click();
  await expect(page.locator("#password-error")).toContainText("at least 12");
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("verify-email strips the fragment and signs the user in", async ({page}) => {
  const email = `${randomUUID()}@authforge.demo`;
  let posted = "";
  await mockAuth(page, email);
  await page.route("**/v1/auth/verify-email", route => { posted = route.request().postData() ?? ""; return route.fulfill(json({user: {id: "demo-user", email}, csrf_token: "test-csrf"}, 200, cookie)); });
  await page.goto("/verify-email#token=verify_testtoken");
  await expect(page.getByRole("heading", {name: "Email verified"})).toBeVisible();
  expect(page.url()).not.toContain("#");
  expect(JSON.parse(posted)).toEqual({token: "verify_testtoken"});
  await expect(page.getByRole("link", {name: "Open console"})).toHaveAttribute("href", "/console");
});

test("verify-email failure offers a resend form", async ({page}) => {
  let resent = "";
  await page.route("**/v1/auth/verify-email", route => route.fulfill(json({error: {code: "invalid_credentials", message: "Authentication failed", request_id: "req_test"}}, 401)));
  await page.route("**/v1/auth/verification-email", route => { resent = route.request().postData() ?? ""; return route.fulfill(json({message: "If the account needs verification, a message has been sent to the configured demo inbox."}, 202)); });
  await page.goto("/verify-email#token=verify_expired");
  await expect(page.getByRole("heading", {name: "This link did not work"})).toBeVisible();
  await page.locator("#resend-email").fill("someone@authforge.demo");
  await page.locator("#resend").click();
  await expect(page.locator("#resend-ok")).toContainText("demo inbox");
  expect(JSON.parse(resent)).toEqual({email: "someone@authforge.demo"});
  await page.goto("/verify-email");
  await expect(page.getByRole("heading", {name: "This link did not work"})).toBeVisible();
});

test("sign-in goes to the console, which shows the email and signs out", async ({page}) => {
  const email = `${randomUUID()}@authforge.demo`;
  await mockAuth(page, email);
  await page.route("**/v1/console/state", route => route.fulfill(json({api_keys: [], sessions: [], events: [], users: []})));
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("a-demo-password-123");
  await page.getByRole("button", {name: "Show password"}).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await page.locator("#submit").click();
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.locator("#user-email")).toHaveText(email);
  await page.getByRole("button", {name: "Sign out"}).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/console");
  await expect(page).toHaveURL(/\/login$/);
});

test("login shows the server message on failure and a rate-limit message on 429", async ({page}) => {
  let status = 401;
  await mockAuth(page, "someone@authforge.demo");
  await page.route("**/v1/auth/login", route => route.fulfill(json({error: {code: status === 429 ? "rate_limited" : "invalid_user_credentials", message: status === 429 ? "Too many authentication attempts" : "Invalid demo email or password.", request_id: "req_test"}}, status)));
  await page.goto("/login");
  await page.locator("#email").fill("someone@authforge.demo");
  await page.locator("#password").fill("wrong-password-123");
  await page.locator("#submit").click();
  await expect(page.locator("#form-error")).toHaveText("Invalid demo email or password.");
  status = 429;
  await page.locator("#submit").click();
  await expect(page.locator("#form-error")).toContainText("Too many attempts");
});

test("console redirects to login when signed out", async ({page}) => {
  await mockAuth(page, "someone@authforge.demo");
  await page.goto("/console");
  await expect(page).toHaveURL(/\/login$/);
});

test("forgot and reset password flow", async ({page}) => {
  let reset = "";
  await page.route("**/v1/auth/password-reset", route => route.fulfill(json({message: "If the account is eligible, a password reset email has been sent to the configured demo inbox."}, 202)));
  await page.route("**/v1/auth/password-reset/confirm", route => { reset = route.request().postData() ?? ""; return route.fulfill({status: 204}); });
  await page.goto("/forgot-password");
  await page.locator("#email").fill("someone@authforge.demo");
  await page.locator("#submit").click();
  await expect(page.getByRole("heading", {name: "Check your inbox"})).toBeVisible();
  await expect(page.locator("#state-done")).toContainText("If the account is eligible");
  await page.goto("/reset-password#token=reset_testtoken");
  expect(page.url()).not.toContain("#");
  await page.locator("#password").fill("new-password-for-browser-test");
  await page.locator("#confirm").fill("new-password-for-browser-test");
  await page.locator("#submit").click();
  await expect(page.getByRole("heading", {name: "Password updated"})).toBeVisible();
  expect(JSON.parse(reset)).toEqual({token: "reset_testtoken", password: "new-password-for-browser-test"});
  await page.goto("/reset-password");
  await expect(page.getByRole("link", {name: "Request a new link"})).toHaveAttribute("href", "/forgot-password");
});

type KeyRow = {id: string; name: string; prefix: string; created_at: string; revoked_at?: string};
type SessionRow = {id: string; api_key_id: string; subject: string; created_at: string; expires_at: string; revoked_at?: string};

/** Mocks a signed-in console backed by mutable in-memory state. */
const mockConsole = async (page: Page, initial: {keys?: KeyRow[]; sessions?: SessionRow[]; users?: unknown[]; events?: unknown[]} = {}) => {
  await mockAuth(page, "operator@authforge.demo", true);
  const data = {keys: initial.keys ?? [], sessions: initial.sessions ?? [], users: initial.users ?? [], events: initial.events ?? [], csrfSeen: [] as string[]};
  await page.route("**/v1/console/state", route => route.fulfill(json({api_keys: data.keys, sessions: data.sessions, events: data.events, users: data.users})));
  await page.route("**/v1/api-keys", route => {
    data.csrfSeen.push(route.request().headers()["x-csrf-token"] ?? "");
    const body = JSON.parse(route.request().postData() ?? "{}") as {name: string};
    const key = {id: randomUUID(), name: body.name, prefix: "sk_AbCdEfGh", created_at: new Date().toISOString()};
    data.keys.unshift(key);
    return route.fulfill(json({...key, secret: "sk_test_secret_value"}, 201));
  });
  await page.route("**/v1/api-keys/*", route => { const id = route.request().url().split("/").pop(); data.keys.find(item => item.id === id)!.revoked_at = new Date().toISOString(); return route.fulfill({status: 204}); });
  await page.route("**/v1/console/sessions/*", route => { const id = route.request().url().split("/").pop(); data.sessions.find(item => item.id === id)!.revoked_at = new Date().toISOString(); return route.fulfill({status: 204}); });
  return data;
};

test("console sidebar switches sections, marks the active item, and keeps the hash on reload", async ({page}) => {
  await mockConsole(page);
  await page.goto("/console");
  const nav = page.getByRole("navigation", {name: "Console sections"});
  await expect(nav.getByRole("link", {name: "Overview"})).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", {level: 1, name: "Overview"})).toBeVisible();
  for (const [label, hash, heading] of [["Users", "users", "Users"], ["API keys", "api-keys", "API keys"], ["Sessions", "sessions", "Sessions"], ["Events", "events", "Events"], ["Authentication settings", "settings", "Authentication settings"]] as const) {
    await nav.getByRole("link", {name: label, exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`#${hash}$`));
    await expect(page.getByRole("heading", {level: 1, name: heading})).toBeVisible();
    await expect(nav.getByRole("link", {name: label, exact: true})).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#crumb")).toHaveText(heading);
  }
  await expect(page.getByText("Coming soon").first()).toBeVisible();
  await expect(page.locator(".badge-ro").first()).toHaveText("Read-only");
  await page.reload();
  await expect(page.getByRole("heading", {level: 1, name: "Authentication settings"})).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#events$/);
  await expect(page.getByRole("heading", {level: 1, name: "Events"})).toBeVisible();
  await expect(page.locator("#events-empty")).toContainText("No events yet");
  await expect(nav.getByRole("link", {name: "Documentation"})).toHaveAttribute("href", "/docs");
  await expect(nav.getByRole("link", {name: "API reference"})).toHaveAttribute("href", "/docs#api");
});

test("console creates an API key in a modal, shows the secret once, and revokes keys and sessions after confirmation", async ({page}) => {
  const data = await mockConsole(page, {sessions: [{id: randomUUID(), api_key_id: "k", subject: "demo-browser-1", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600_000).toISOString()}]});
  await page.goto("/console#api-keys");
  await expect(page.locator("#keys-empty")).toContainText("No API keys yet");
  await page.getByRole("button", {name: "Create API key"}).first().click();
  const dialog = page.getByRole("dialog", {name: "Create API key"});
  await expect(dialog).toBeVisible();
  await expect(page.locator("#key-name")).toBeFocused();
  await dialog.getByRole("button", {name: "Create key"}).click();
  await expect(page.locator("#key-error")).toHaveText("Enter a name for the key.");
  const name = `browser-${randomUUID()}`;
  await page.getByLabel("Key name", {exact: true}).fill(name);
  await dialog.getByRole("button", {name: "Create key"}).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#new-secret-value")).toHaveText("sk_test_secret_value");
  expect(data.csrfSeen).toEqual(["test-csrf"]);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#copy-secret").click();
  await expect(page.locator("#toasts")).toContainText("API key copied to the clipboard.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("sk_test_secret_value");
  await page.getByRole("button", {name: "I've saved it"}).click();
  await expect(page.locator("#new-secret")).toBeHidden();
  await expect(page.locator("#new-secret-value")).toHaveText("");

  const keyRow = page.locator("#key-table tbody tr").filter({hasText: name});
  await expect(keyRow).toContainText("sk_AbCdEfGh");
  await keyRow.getByRole("button", {name: /Revoke/}).click();
  await expect(page.locator("#confirm-cancel")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(keyRow).toContainText("Active");
  await keyRow.getByRole("button", {name: /Revoke/}).click();
  await page.locator("#confirm-ok").click();
  await expect(keyRow).toContainText("Revoked");
  await expect(page.locator("#toasts")).toContainText("API key revoked.");

  await page.getByRole("link", {name: "Sessions", exact: true}).click();
  const sessionRow = page.locator("#session-table tbody tr").filter({hasText: "demo-browser-1"});
  await sessionRow.getByRole("button", {name: /Revoke/}).click();
  await page.locator("#confirm-ok").click();
  await expect(sessionRow).toContainText("Revoked");
  await page.locator('[data-filter="active"]').click();
  await expect(page.locator("#sessions-empty")).toContainText("No sessions match this filter");
  await page.locator('[data-filter="ended"]').click();
  await expect(sessionRow).toBeVisible();
});

test("console users table renders demo users from state and filters by email", async ({page}) => {
  await mockConsole(page, {users: [
    {id: "u1", email: "ada@authforge.demo", email_verified: true, created_at: new Date().toISOString()},
    {id: "u2", email: "grace@authforge.demo", email_verified: false, created_at: new Date(Date.now() - 86_400_000).toISOString()}
  ]});
  await page.goto("/console#users");
  const rows = page.locator("#user-table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("ada@authforge.demo");
  await expect(rows.nth(0)).toContainText("Verified");
  await expect(rows.nth(1)).toContainText("Pending");
  await expect(page.locator("#m-users")).toHaveText("2");
  await page.getByLabel("Search users by email").fill("grace");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("grace@authforge.demo");
  await page.getByLabel("Search users by email").fill("nobody");
  await expect(page.locator("#users-empty")).toContainText("No matching users");
});

test("console sidebar becomes a drawer on mobile that opens and closes", async ({page}) => {
  await page.setViewportSize({width: 375, height: 812});
  await mockConsole(page);
  await page.goto("/console");
  const sidebar = page.locator("#sidebar");
  await expect(page.getByRole("button", {name: "Open navigation"})).toBeVisible();
  await expect(sidebar).not.toBeInViewport();
  await page.getByRole("button", {name: "Open navigation"}).click();
  await expect(sidebar).toBeInViewport({ratio: 0.9});
  await expect(page.getByRole("button", {name: "Open navigation"})).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(sidebar).not.toBeInViewport();
  await page.getByRole("button", {name: "Open navigation"}).click();
  await page.getByRole("link", {name: "API keys", exact: true}).click();
  await expect(page).toHaveURL(/#api-keys$/);
  await expect(sidebar).not.toBeInViewport();
  for (const hash of ["overview", "users", "api-keys", "sessions", "events", "settings"]) {
    await page.goto(`/console#${hash}`);
    expect(await noHorizontalScroll(page)).toBe(true);
  }
});

test("console returns to login when an API call reports the session ended", async ({page}) => {
  await mockAuth(page, "someone@authforge.demo", true);
  await page.route("**/v1/console/state", route => route.fulfill(signedOut()));
  await page.goto("/console");
  await expect(page).toHaveURL(/\/login$/);
});

test("docs page loads, TOC anchors scroll, and Copy copies a code block", async ({page}) => {
  await mockAuth(page, "someone@authforge.demo");
  await page.goto("/docs");
  await expect(page.getByRole("heading", {level: 1})).toHaveText("AuthForge documentation");
  await expect(page.locator("[data-origin]").first()).toHaveText("http://127.0.0.1:8081");
  await page.getByRole("link", {name: "Errors", exact: true}).first().click();
  await expect(page).toHaveURL(/#errors$/);
  await expect(page.locator("#errors")).toBeInViewport();
  await page.getByRole("link", {name: "Create a session"}).click();
  await expect(page.locator("#create-session")).toBeInViewport();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const block = page.locator("#quickstart .codeblock").first();
  await block.getByRole("button", {name: "Copy"}).click();
  await expect(block.getByRole("button")).toHaveText("Copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("/v1/sessions");
  expect(copied).toContain("http://127.0.0.1:8081");
  for (const width of [1280, 375]) {
    await page.setViewportSize({width, height: 800});
    expect(await noHorizontalScroll(page)).toBe(true);
  }
});
