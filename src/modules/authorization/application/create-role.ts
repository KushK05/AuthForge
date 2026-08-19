import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { idempotencyKeyReused, invalidRequest, notFound } from "../../../shared/application/errors.js";

export type RoleSummary = Readonly<{
  id: string;
  name: string;
  description: string | undefined;
  permissions: readonly string[];
}>;

export type CreateRoleCommand = Readonly<{
  authenticatedProjectId: string;
  actorKeyId: string;
  targetProjectId: string;
  name: string;
  description: string | undefined;
  permissions: readonly string[];
  correlationId: string;
  idempotencyKey: string;
  requestHash: Buffer;
  now: Date;
}>;

export interface RoleCreationTransaction {
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
  }>): Promise<Readonly<{ requestHash: Buffer; role: RoleSummary }> | undefined>;
  findKnownPermissions(codes: readonly string[]): Promise<readonly string[]>;
  createRole(input: Readonly<{
    id: string;
    projectId: string;
    name: string;
    description: string | undefined;
    permissions: readonly string[];
  }>): Promise<RoleSummary>;
  appendAuditEvent(input: Readonly<{
    projectId: string;
    actorKeyId: string;
    action: "authorization.role.created";
    roleId: string;
    correlationId: string;
  }>): Promise<void>;
  appendOutboxEvent(input: Readonly<{
    id: string;
    projectId: string;
    correlationId: string;
    payload: Readonly<{ role_id: string }>;
  }>): Promise<void>;
  saveIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    requestHash: Buffer;
    role: RoleSummary;
    expiresAt: Date;
  }>): Promise<void>;
}

export interface RoleCreationRepository {
  transaction<T>(operation: (transaction: RoleCreationTransaction) => Promise<T>): Promise<T>;
}

const idempotencyRoute = (projectId: string): string => `/v1/developer/projects/${projectId}/roles`;

export const hashCreateRoleRequest = (input: Readonly<{
  name: string;
  description: string | undefined;
  permissions: readonly string[];
}>): Buffer => createHash("sha256").update(JSON.stringify(input)).digest();

const normalizeName = (name: string): string => name.trim();

export const createRole = async (
  repository: RoleCreationRepository,
  command: CreateRoleCommand
): Promise<Readonly<{ role: RoleSummary; replayed: boolean }>> => {
  if (command.authenticatedProjectId !== command.targetProjectId) throw notFound("Project is unavailable");
  const name = normalizeName(command.name);
  if (name.length < 1 || name.length > 120) throw invalidRequest("Role name must contain between 1 and 120 characters");
  if (command.description && command.description.length > 1_024) throw invalidRequest("Role description exceeds 1024 characters");
  if (command.permissions.length === 0 || new Set(command.permissions).size !== command.permissions.length) {
    throw invalidRequest("Roles require unique permissions");
  }

  return repository.transaction(async (transaction) => {
    const scope = {
      principalId: command.actorKeyId,
      projectId: command.authenticatedProjectId,
      route: idempotencyRoute(command.targetProjectId),
      key: command.idempotencyKey
    };
    await transaction.lockIdempotencyScope(scope);
    const prior = await transaction.findIdempotencyRecord({ ...scope, now: command.now });
    if (prior) {
      if (prior.requestHash.byteLength !== command.requestHash.byteLength || !timingSafeEqual(prior.requestHash, command.requestHash)) {
        throw idempotencyKeyReused();
      }
      return { role: prior.role, replayed: true };
    }
    const knownPermissions = await transaction.findKnownPermissions(command.permissions);
    if (knownPermissions.length !== command.permissions.length) throw invalidRequest("Role contains an unknown permission");

    const role = await transaction.createRole({
      id: randomUUID(),
      projectId: command.targetProjectId,
      name,
      description: command.description,
      permissions: command.permissions
    });
    await transaction.appendAuditEvent({
      projectId: command.targetProjectId,
      actorKeyId: command.actorKeyId,
      action: "authorization.role.created",
      roleId: role.id,
      correlationId: command.correlationId
    });
    await transaction.appendOutboxEvent({
      id: randomUUID(),
      projectId: command.targetProjectId,
      correlationId: command.correlationId,
      payload: { role_id: role.id }
    });
    await transaction.saveIdempotencyRecord({
      ...scope,
      requestHash: command.requestHash,
      role,
      expiresAt: new Date(command.now.getTime() + 24 * 60 * 60 * 1_000)
    });
    return { role, replayed: false };
  });
};
