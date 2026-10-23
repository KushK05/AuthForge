import { randomUUID } from "node:crypto";
import argon2 from "argon2";

import type { AppConfig } from "../../platform/config.js";
import type { DemoUserRecord, DemoUserSessionRecord, ShowcaseStore } from "../../platform/store.js";
import { invalidCredentials, invalidRequest } from "../../shared/application/errors.js";
import { generatePrefixedSecret, hashOpaqueSecret, timingSafeBufferEqual } from "../../shared/crypto/opaque-secret.js";

const approvedEmail = /^[a-z0-9._%+-]+@authforge\.demo$/;
export type AuthenticatedUser = Readonly<{ user: DemoUserRecord; token: string; csrfToken: string }>;

export class UserService {
  public constructor(private readonly config: AppConfig, private readonly store: ShowcaseStore) {}
  public async register(emailInput: string, password: string): Promise<AuthenticatedUser> {
    const email = emailInput.trim().toLowerCase();
    if (!approvedEmail.test(email)) throw invalidRequest("Use an approved @authforge.demo email address");
    if (password.length < 12 || password.length > 256) throw invalidRequest("Password must be between 12 and 256 characters");
    const user: DemoUserRecord = { id: randomUUID(), email, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), createdAt: new Date() };
    if (!(await this.store.createUser(user))) throw invalidRequest("An account already exists for this demo email");
    return this.createSession(user);
  }
  public async login(emailInput: string, password: string): Promise<AuthenticatedUser> {
    const email = emailInput.trim().toLowerCase(); const user = await this.store.findUserByEmail(email);
    if (!user || !(await argon2.verify(user.passwordHash, password))) throw invalidCredentials("invalid_credentials");
    return this.createSession(user);
  }
  public async authenticate(token: string | undefined): Promise<{ user: DemoUserRecord; session: DemoUserSessionRecord }> {
    if (!token) throw invalidCredentials("invalid_credentials");
    const session = await this.store.findUserSession(hashOpaqueSecret(token, this.config.credentialHashKey), new Date());
    if (!session) throw invalidCredentials("invalid_credentials");
    const user = await this.store.findUserById(session.userId); if (!user) throw invalidCredentials("invalid_credentials");
    return { user, session };
  }
  public async verifyCsrf(session: DemoUserSessionRecord, token: string | undefined): Promise<void> {
    if (!token || !timingSafeBufferEqual(session.csrfDigest, hashOpaqueSecret(token, this.config.credentialHashKey))) throw invalidRequest("Invalid request proof");
  }
  private async createSession(user: DemoUserRecord): Promise<AuthenticatedUser> {
    const token = generatePrefixedSecret("usr").value; const csrfToken = generatePrefixedSecret("csrf").value; const now = new Date();
    await this.store.createUserSession({ id: randomUUID(), userId: user.id, tokenDigest: hashOpaqueSecret(token, this.config.credentialHashKey), csrfDigest: hashOpaqueSecret(csrfToken, this.config.credentialHashKey), createdAt: now, expiresAt: new Date(now.getTime() + 60 * 60 * 1000) });
    return { user, token, csrfToken };
  }
}
