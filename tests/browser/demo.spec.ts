import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("hosted registration, verification, reload, signout, and sign-in", async ({page}) => {
  const email = `${randomUUID()}@authforge.demo`;
  let verified = false;
  await page.route("**/v1/auth/register", route => route.fulfill({status: 202, contentType: "application/json", body: JSON.stringify({message: "If the account can be registered, a verification email has been sent to the configured demo inbox."})}));
  await page.route("**/v1/auth/verify-email", route => {
    verified = true;
    return route.fulfill({status: 200, contentType: "application/json", headers: {"set-cookie": "authforge_user=browser-user; Path=/; HttpOnly; SameSite=Strict"}, body: JSON.stringify({user: {id: "demo-user", email}, csrf_token: "test-csrf"})});
  });
  await page.route("**/v1/auth/me", route => route.fulfill({status: verified ? 200 : 401, contentType: "application/json", body: JSON.stringify(verified ? {user: {id: "demo-user", email}, csrf_token: "test-csrf"} : {error: {code: "invalid_user_credentials", message: "Sign in failed"}})}));
  await page.route("**/v1/auth/session", route => route.fulfill({status: 204, headers: {"set-cookie": "authforge_user=; Path=/; Max-Age=0"}}));
  await page.route("**/v1/auth/login", route => route.fulfill({status: 200, contentType: "application/json", headers: {"set-cookie": "authforge_user=browser-user; Path=/; HttpOnly; SameSite=Strict"}, body: JSON.stringify({user: {id: "demo-user", email}, csrf_token: "test-csrf"})}));
  await page.goto("/");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("a-demo-password-123");
  await page.locator("#submit").click();
  await expect(page.locator("#pending")).toBeVisible();
  await expect(page.locator("#pending-copy")).toContainText("configured test inbox");
  await page.goto("/console");
  await page.goto("/#action=verify-email&token=verify_testtoken");
  await expect(page).toHaveURL(/http:\/\/127\.0\.0\.1:8081\//);
  await page.locator("#submit").click();
  await expect(page.locator("#account-email")).toHaveText(email);
  await page.reload();
  await expect(page.locator("#account-email")).toHaveText(email);
  await page.locator("#signout").click();
  await expect(page.locator("#auth-form")).toBeVisible();
  expect((await page.request.get("/v1/auth/me")).status()).toBe(401);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("a-demo-password-123");
  await page.locator("#submit").click();
  await expect(page.locator("#account-email")).toHaveText(email);
});

test("password reset UI sends a generic request and accepts its one-time link", async ({page}) => {
  const email = `${randomUUID()}@authforge.demo`;
  await page.route("**/v1/auth/password-reset", route => route.fulfill({status: 202, contentType: "application/json", body: JSON.stringify({message: "If the account is eligible, a password reset email has been sent to the configured demo inbox."})}));
  let reset = false;
  await page.route("**/v1/auth/password-reset/confirm", route => {reset = true; return route.fulfill({status: 204});});
  await page.goto("/");
  await page.getByRole("button", {name: "Sign in"}).click();
  await page.locator("#email").fill(email);
  await page.locator("#forgot-password").click();
  await page.locator("#submit").click();
  await expect(page.locator("#pending-copy")).toContainText("configured test inbox");
  await page.goto("/console");
  await page.goto("/#action=reset-password&token=reset_testtoken");
  await page.locator("#password").fill("new-password-for-browser-test");
  await page.locator("#submit").click();
  await expect.poll(() => reset).toBe(true);
  await expect(page.locator("#status")).toContainText("Password reset");
});

test("console key and session lifecycle, keyboard dialog, and secret clearing", async ({page}) => {
  await page.goto("/console");
  await page.getByLabel("Access code", {exact: true}).fill("test-console-access-code");
  await page.locator("#login-submit").click();
  await page.locator('[data-view="keys"]').click();
  const name = `browser-${randomUUID()}`;
  const subject = `demo-browser-${randomUUID()}`;
  await page.getByLabel("Key name", {exact: true}).fill(name);
  await page.locator("#key-submit").click();
  await expect(page.locator("#new-secret")).toBeVisible();
  const key = (await page.locator("#new-secret-value").textContent())!;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#copy-secret").click();
  await expect(page.locator("#toast")).toHaveText("API key copied to the clipboard.");
  expect(await page.evaluate(expected => navigator.clipboard.readText().then(value => value === expected), key)).toBe(true);
  await page.locator("#dismiss-secret").click();
  await expect(page.locator("#new-secret-value")).toHaveText("");
  const created = await page.request.post("/v1/sessions", {headers: {authorization: `Bearer ${key}`}, data: {subject}});
  expect(created.status()).toBe(201);
  const session = await created.json();
  await page.locator('[data-view="sessions"]').click();
  const row = page.locator("#session-list .list-item").filter({hasText: subject});
  await row.getByRole("button", {name: "Revoke", exact: true}).click();
  await expect(page.locator("#dialog-cancel")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#dialog-confirm")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await row.getByRole("button", {name: "Revoke", exact: true}).click();
  await page.locator("#dialog-confirm").click();
  await expect(row).toContainText("Revoked");
  expect((await page.request.post("/v1/sessions/validate", {headers: {authorization: `Bearer ${key}`}, data: {token: session.token}})).status()).toBe(401);
  await page.locator('[data-view="keys"]').click();
  await page.locator("#key-list .list-item").filter({hasText: name}).getByRole("button", {name: "Revoke", exact: true}).click();
  await page.locator("#dialog-confirm").click();
  await expect(page.locator("#key-list .list-item").filter({hasText: name})).toContainText("Revoked");
  await page.locator("#logout").click();
  await expect(page.locator("#login")).toBeVisible();
});

test("hosted page works at a narrow viewport and rejects real email", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto("/");
  await page.locator("#email").fill("someone@example.com");
  await page.locator("#password").fill("a-demo-password-123");
  await page.locator("#submit").click();
  await expect(page.locator("#error")).toContainText("@authforge.demo");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("canceling key revocation and browsing sections leaves the key active", async ({page}) => {
  const deletes: string[] = [];
  page.on("request", request => {
    if (request.method() === "DELETE" && new URL(request.url()).pathname.startsWith("/v1/api-keys/")) deletes.push("key-revocation");
  });
  await page.goto("/console");
  await page.getByLabel("Access code", {exact: true}).fill("test-console-access-code");
  await page.locator("#login-submit").click();
  await page.locator('[data-view="keys"]').click();
  const name = `cancel-key-${randomUUID()}`;
  await page.getByLabel("Key name", {exact: true}).fill(name);
  await page.locator("#key-submit").click();
  await expect(page.locator("#new-secret")).toBeVisible();
  const key = (await page.locator("#new-secret-value").textContent())!;
  await page.locator("#dismiss-secret").click();
  const row = page.locator("#key-list .list-item").filter({hasText: name});
  const revoke = row.getByRole("button", {name: "Revoke", exact: true});

  for (const dismiss of ["cancel", "escape", "backdrop"]) {
    await revoke.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    if (dismiss === "cancel") await page.getByRole("button", {name: "Cancel", exact: true}).click();
    else if (dismiss === "escape") await page.keyboard.press("Escape");
    else await page.locator("#dialog-backdrop").click({position: {x: 2, y: 2}});
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(revoke).toBeFocused();
    // A dismissed dialog must not leave an executable pending revocation.
    await page.locator("#dialog-confirm").evaluate((button: HTMLButtonElement) => button.click());
    expect((await page.request.get("/v1/sessions", {headers: {authorization: `Bearer ${key}`}})).status()).toBe(200);
  }

  for (const view of ["authentication", "mfa", "sessions", "paths", "webhooks", "keys"]) {
    await page.locator(`[data-view="${view}"]`).click();
    await expect(page.locator(`#view-${view}`)).toBeVisible();
  }
  await expect(revoke).toBeVisible();
  await expect(row.locator(".chip.revoked")).toHaveCount(0);
  expect(deletes).toEqual([]);
  const listed = await page.request.get("/v1/api-keys");
  expect((await listed.json()).data.find((item: {name: string}) => item.name === name)).not.toHaveProperty("revoked_at");
  expect((await page.request.get("/v1/sessions", {headers: {authorization: `Bearer ${key}`}})).status()).toBe(200);
});
