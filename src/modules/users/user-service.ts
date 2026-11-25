import { randomUUID } from "node:crypto";
import argon2 from "argon2";

import type { AppConfig } from "../../platform/config.js";
import type { DemoUserEmailActionRecord, DemoUserRecord, DemoUserSessionRecord, ShowcaseStore } from "../../platform/store.js";
import { invalidCredentials, invalidCsrf, invalidRequest, unavailableDependency } from "../../shared/application/errors.js";
import { generatePrefixedSecret, hashOpaqueSecret, timingSafeBufferEqual, userCsrfToken } from "../../shared/crypto/opaque-secret.js";
import type { AuthEmailSender } from "./auth-email-service.js";

const approvedEmail = /^[a-z0-9._%+-]+@authforge\.demo$/;
const actionTokenPattern = /^(verify|reset)_[A-Za-z0-9_-]{43}$/;
export type AuthenticatedUser = Readonly<{ user: DemoUserRecord; token: string; csrfToken: string }>;

export class UserService {
  private readonly dummyHash = argon2.hash(randomUUID(), { type: argon2.argon2id });
  public constructor(
    private readonly config: AppConfig,
    private readonly store: ShowcaseStore,
    private readonly emailSender: AuthEmailSender
  ) {}

  public async register(emailInput: string, password: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    if (email.length > 254 || !approvedEmail.test(email)) throw invalidRequest("Use an approved @authforge.demo email address");
    if (password.length < 12 || password.length > 256) throw invalidRequest("Password must be between 12 and 256 characters");
    const issued = this.makeAction("verify_email", randomUUID(), 60 * 60_000);
    const user: DemoUserRecord = {
      id: issued.action.userId, email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      createdAt: issued.action.createdAt
    };
    const created = await this.store.createPendingUser(user, issued.action, this.config.maxDemoUsers ?? 100);
    if (created) await this.emailSender.sendVerification(issued.token);
  }

  public async resendVerification(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    if (approvedEmail.test(email)) {
      const user = await this.store.findUserByEmail(email);
      if (user && !user.emailVerifiedAt) {
        const issued = this.makeAction("verify_email", user.id, 60 * 60_000);
        if (await this.store.createUserEmailAction(issued.action)) await this.emailSender.sendVerification(issued.token);
      }
    }
  }

  public async verifyEmail(token: string): Promise<AuthenticatedUser> {
    if (!actionTokenPattern.test(token) || !token.startsWith("verify_")) throw invalidCredentials();
    const issuedSession = this.issueSession();
    const user = await this.store.verifyUserEmail(
      hashOpaqueSecret(token, this.config.credentialHashKey), new Date(), issuedSession.session, this.config.maxUserSessions ?? 100
    );
    if (!user) throw invalidCredentials();
    return {...issuedSession, user};
  }

  public async requestPasswordReset(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    if (!approvedEmail.test(email)) return;
    const user = await this.store.findUserByEmail(email);
    if (!user?.emailVerifiedAt) return;
    const issued = this.makeAction("reset_password", user.id, 15 * 60_000);
    if (await this.store.createUserEmailAction(issued.action)) await this.emailSender.sendPasswordReset(issued.token);
  }

  public async resetPassword(token: string, password: string): Promise<void> {
    if (password.length < 12 || password.length > 256) throw invalidRequest("Password must be between 12 and 256 characters");
    if (!actionTokenPattern.test(token) || !token.startsWith("reset_")) throw invalidCredentials();
    const passwordHash = await argon2.hash(password, {type: argon2.argon2id});
    const reset = await this.store.resetUserPassword(hashOpaqueSecret(token, this.config.credentialHashKey), passwordHash, new Date());
    if (!reset) throw invalidCredentials();
  }

  public async login(emailInput: string, password: string): Promise<AuthenticatedUser> {
    const user = await this.store.findUserByEmail(emailInput.trim().toLowerCase());
    const matches = await argon2.verify(user?.passwordHash ?? await this.dummyHash, password);
    if (!user || !matches || !user.emailVerifiedAt) throw invalidCredentials("invalid_user_credentials");
    const issued = this.issueSession();
    await this.store.createUserSession({...issued.session, userId: user.id}, this.config.maxUserSessions ?? 100);
    return {...issued, user};
  }

  public async authenticate(token: string | undefined): Promise<{ user: DemoUserRecord; session: DemoUserSessionRecord; csrfToken: string }> {
    if (!token || !/^usr_[A-Za-z0-9_-]{43}$/.test(token)) throw invalidCredentials("invalid_user_credentials");
    const session = await this.store.findUserSession(hashOpaqueSecret(token, this.config.credentialHashKey), new Date());
    if (!session) throw invalidCredentials("invalid_user_credentials");
    const user = await this.store.findUserById(session.userId);
    if (!user?.emailVerifiedAt) throw invalidCredentials("invalid_user_credentials");
    return { user, session, csrfToken: userCsrfToken(token, this.config.credentialHashKey) };
  }

  public verifyCsrf(session: DemoUserSessionRecord, token: string | undefined): void {
    if (!token || !timingSafeBufferEqual(session.csrfDigest, hashOpaqueSecret(token, this.config.credentialHashKey))) throw invalidCsrf();
  }

  private makeAction(purpose: DemoUserEmailActionRecord["purpose"], userId: string, lifetimeMs: number): {action: DemoUserEmailActionRecord; token: string} {
    if (!this.config.authEmailFromEmail || !this.config.authEmailTestRecipient) throw unavailableDependency();
    const secret = generatePrefixedSecret(purpose === "verify_email" ? "verify" : "reset").value;
    const createdAt = new Date();
    return {
      token: secret,
      action: {
        id: randomUUID(), userId, purpose, tokenDigest: hashOpaqueSecret(secret, this.config.credentialHashKey),
        createdAt, expiresAt: new Date(createdAt.getTime() + lifetimeMs)
      }
    };
  }

  private issueSession(): Omit<AuthenticatedUser, "user"> & {session: Omit<DemoUserSessionRecord, "userId">} {
    const token = generatePrefixedSecret("usr").value;
    const csrfToken = userCsrfToken(token, this.config.credentialHashKey);
    const now = new Date();
    return {
      token, csrfToken,
      session: {
        id: randomUUID(),
        tokenDigest: hashOpaqueSecret(token, this.config.credentialHashKey),
        csrfDigest: hashOpaqueSecret(csrfToken, this.config.credentialHashKey),
        createdAt: now, expiresAt: new Date(now.getTime() + 3_600_000)
      }
    };
  }
}
