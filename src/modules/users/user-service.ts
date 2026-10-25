import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import type { AppConfig } from "../../platform/config.js";
import type { DemoUserRecord, DemoUserSessionRecord, ShowcaseStore } from "../../platform/store.js";
import { conflict, invalidCredentials, invalidCsrf, invalidRequest } from "../../shared/application/errors.js";
import { generatePrefixedSecret, hashOpaqueSecret, timingSafeBufferEqual, userCsrfToken } from "../../shared/crypto/opaque-secret.js";

const approvedEmail = /^[a-z0-9._%+-]+@authforge\.demo$/;
export type AuthenticatedUser = Readonly<{ user: DemoUserRecord; token: string; csrfToken: string }>;

export class UserService {
  private readonly dummyHash = argon2.hash(randomUUID(), { type: argon2.argon2id });
  public constructor(private readonly config: AppConfig, private readonly store: ShowcaseStore) {}

  public async register(emailInput: string, password: string): Promise<AuthenticatedUser> {
    const email = emailInput.trim().toLowerCase();
    if (email.length > 254 || !approvedEmail.test(email)) throw invalidRequest("Use an approved @authforge.demo email address");
    if (password.length < 12 || password.length > 256) throw invalidRequest("Password must be between 12 and 256 characters");
    const user: DemoUserRecord = { id: randomUUID(), email, passwordHash: await argon2.hash(password, { type: argon2.argon2id }), createdAt: new Date() };
    const issued = this.issueSession(user);
    if (!(await this.store.createUserAndSession(user, issued.session, this.config.maxDemoUsers ?? 100, this.config.maxUserSessions ?? 100))) throw conflict();
    return { user, token: issued.token, csrfToken: issued.csrfToken };
  }

  public async login(emailInput: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.store.findUserByEmail(emailInput.trim().toLowerCase());
    const matches = await argon2.verify(user?.passwordHash ?? await this.dummyHash, password);
    if (!user || !matches) throw invalidCredentials("invalid_user_credentials");
    const issued = this.issueSession(user);
    await this.store.createUserSession(issued.session, this.config.maxUserSessions ?? 100);
    return { user, token: issued.token, csrfToken: issued.csrfToken };
  }

  public async authenticate(token: string | undefined): Promise<{ user: DemoUserRecord; session: DemoUserSessionRecord; csrfToken: string }> {
    if (!token || !/^usr_[A-Za-z0-9_-]{43}$/.test(token)) throw invalidCredentials("invalid_user_credentials");
    const session = await this.store.findUserSession(hashOpaqueSecret(token, this.config.credentialHashKey), new Date());
    if (!session) throw invalidCredentials("invalid_user_credentials");
    const user = await this.store.findUserById(session.userId);
    if (!user) throw invalidCredentials("invalid_user_credentials");
    return { user, session, csrfToken: userCsrfToken(token, this.config.credentialHashKey) };
  }

  public verifyCsrf(session: DemoUserSessionRecord, token: string | undefined): void {
    if (!token || !timingSafeBufferEqual(session.csrfDigest, hashOpaqueSecret(token, this.config.credentialHashKey))) throw invalidCsrf();
  }

  private issueSession(user: DemoUserRecord): { token: string; csrfToken: string; session: DemoUserSessionRecord } {
    const token = generatePrefixedSecret("usr").value;
    const csrfToken = userCsrfToken(token, this.config.credentialHashKey);
    const now = new Date();
    return { token, csrfToken, session: {
      id: randomUUID(), userId: user.id,
      tokenDigest: hashOpaqueSecret(token, this.config.credentialHashKey),
      csrfDigest: hashOpaqueSecret(csrfToken, this.config.credentialHashKey),
      createdAt: now, expiresAt: new Date(now.getTime() + 3_600_000)
    } };
  }
}
