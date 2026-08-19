import { randomUUID } from "node:crypto";

import type { UserRoleReader } from "../../authorization/application/user-role-reader.js";
import type { ProjectEnvironmentReader } from "../../developer-platform/application/project-environment-reader.js";
import type { IdentityCredentialsReader } from "../../identity/application/user-reader.js";
import { normalizeEmail } from "../../identity/application/sign-up.js";
import { verifyPassword } from "../../identity/domain/password.js";
import { invalidCredentials, unavailableDependency } from "../../../shared/application/errors.js";

import type { AccessTokenSigner } from "./access-token-signer.js";
import { createSession, type SessionCreationRepository } from "./create-session.js";

export type SignInDependencies = Readonly<{
  userCredentials: IdentityCredentialsReader;
  projectEnvironment: ProjectEnvironmentReader;
  userRoles: UserRoleReader;
  sessions: SessionCreationRepository;
  accessTokenSigner: AccessTokenSigner;
}>;

export type SignInCommand = Readonly<{
  projectId: string;
  email: string;
  password: string;
  refreshTokenHashKey: string;
  correlationId: string;
  now: Date;
}>;

export type SignInResponse = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Readonly<{ id: string; email: string; status: "active" }>;
}>;

export const signIn = async (
  dependencies: SignInDependencies,
  command: SignInCommand
): Promise<SignInResponse> => {
  const user = await dependencies.userCredentials.findUserForSignIn({
    projectId: command.projectId,
    normalizedEmail: normalizeEmail(command.email)
  });
  if (!user || user.status !== "active" || !(await verifyPassword(user.passwordHash, command.password))) {
    throw invalidCredentials();
  }
  const [environment, authorization] = await Promise.all([
    dependencies.projectEnvironment.findDefaultEnvironment(command.projectId),
    dependencies.userRoles.findUserAuthorizationClaims({ projectId: command.projectId, userId: user.id })
  ]);
  if (!environment) throw unavailableDependency();

  const sessionId = randomUUID();
  let accessToken: string;
  let expiresIn: number;
  try {
    ({ accessToken, expiresIn } = await dependencies.accessTokenSigner.issue({
      issuer: environment.issuer,
      audience: environment.audience,
      subject: user.id,
      sessionId,
      projectId: command.projectId,
      tokenVersion: user.tokenVersion,
      roles: authorization.roles,
      scope: authorization.scope,
      issuedAt: command.now
    }));
  } catch {
    throw unavailableDependency();
  }
  const session = await createSession(dependencies.sessions, {
    sessionId,
    projectId: command.projectId,
    userId: user.id,
    tokenHashKey: command.refreshTokenHashKey,
    correlationId: command.correlationId,
    now: command.now
  });
  return {
    accessToken,
    refreshToken: session.refreshToken,
    expiresIn,
    user: { id: user.id, email: user.email, status: "active" }
  };
};
