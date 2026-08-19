import { createHash, timingSafeEqual } from "node:crypto";

import { idempotencyKeyReused, notFound } from "../../../shared/application/errors.js";
import type { IdentityUserReader } from "../../identity/application/user-reader.js";

export type ReplaceUserRolesCommand = Readonly<{
  authenticatedProjectId: string;
  actorKeyId: string;
  targetProjectId: string;
  userId: string;
  roleIds: readonly string[];
  correlationId: string;
  idempotencyKey: string;
  now: Date;
}>;

export interface UserRoleAssignmentTransaction {
  lockIdempotencyScope(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
  }>): Promise<void>;
  findIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    now: Date;
  }>): Promise<Readonly<{ requestHash: Buffer; roleIds: readonly string[] }> | undefined>;
  findRoleIds(input: Readonly<{ projectId: string; roleIds: readonly string[] }>): Promise<readonly string[]>;
  replaceUserRoles(input: Readonly<{ projectId: string; userId: string; roleIds: readonly string[] }>): Promise<void>;
  appendAuditEvent(input: Readonly<{
    projectId: string;
    actorKeyId: string;
    action: "authorization.user_roles.replaced";
    userId: string;
    correlationId: string;
  }>): Promise<void>;
  appendOutboxEvent(input: Readonly<{
    projectId: string;
    correlationId: string;
    payload: Readonly<{ user_id: string; role_ids: readonly string[] }>;
  }>): Promise<void>;
  saveIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    requestHash: Buffer;
    roleIds: readonly string[];
    expiresAt: Date;
  }>): Promise<void>;
}

export interface UserRoleAssignmentRepository {
  transaction<T>(operation: (transaction: UserRoleAssignmentTransaction) => Promise<T>): Promise<T>;
}

const routeFor = (projectId: string, userId: string): string => `/v1/developer/projects/${projectId}/users/${userId}/roles`;
const requestHash = (roleIds: readonly string[]): Buffer => createHash("sha256").update(JSON.stringify({ role_ids: roleIds })).digest();

export const replaceUserRoles = async (
  repository: UserRoleAssignmentRepository,
  users: IdentityUserReader,
  command: ReplaceUserRolesCommand
): Promise<readonly string[]> => {
  if (command.authenticatedProjectId !== command.targetProjectId) throw notFound("Project is unavailable");
  if (new Set(command.roleIds).size !== command.roleIds.length) throw notFound("Role is unavailable");
  if (!(await users.findUserInProject({ projectId: command.targetProjectId, userId: command.userId }))) {
    throw notFound("User is unavailable");
  }
  return repository.transaction(async (transaction) => {
    const scope = {
      principalId: command.actorKeyId,
      projectId: command.authenticatedProjectId,
      route: routeFor(command.targetProjectId, command.userId),
      key: command.idempotencyKey
    };
    const hash = requestHash(command.roleIds);
    await transaction.lockIdempotencyScope(scope);
    const prior = await transaction.findIdempotencyRecord({ ...scope, now: command.now });
    if (prior) {
      if (prior.requestHash.byteLength !== hash.byteLength || !timingSafeEqual(prior.requestHash, hash)) {
        throw idempotencyKeyReused();
      }
      return prior.roleIds;
    }
    const knownRoleIds = await transaction.findRoleIds({ projectId: command.targetProjectId, roleIds: command.roleIds });
    if (knownRoleIds.length !== command.roleIds.length) throw notFound("Role is unavailable");
    await transaction.replaceUserRoles({ projectId: command.targetProjectId, userId: command.userId, roleIds: command.roleIds });
    await transaction.appendAuditEvent({
      projectId: command.targetProjectId,
      actorKeyId: command.actorKeyId,
      action: "authorization.user_roles.replaced",
      userId: command.userId,
      correlationId: command.correlationId
    });
    await transaction.appendOutboxEvent({
      projectId: command.targetProjectId,
      correlationId: command.correlationId,
      payload: { user_id: command.userId, role_ids: command.roleIds }
    });
    await transaction.saveIdempotencyRecord({
      ...scope,
      requestHash: hash,
      roleIds: command.roleIds,
      expiresAt: new Date(command.now.getTime() + 24 * 60 * 60 * 1_000)
    });
    return command.roleIds;
  });
};
