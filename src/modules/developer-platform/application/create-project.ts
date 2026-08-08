import { randomUUID, timingSafeEqual } from "node:crypto";

import {
  idempotencyKeyReused,
  invalidRequest,
  notFound
} from "../../../shared/application/errors.js";

export type ProjectSummary = Readonly<{
  id: string;
  name: string;
  status: "active";
  defaultEnvironment: Readonly<{
    id: string;
    name: "development";
    issuer: string;
    audience: string;
  }>;
}>;

export type CreateProjectCommand = Readonly<{
  authenticatedProjectId: string;
  actorKeyId: string;
  name: string;
  correlationId: string;
  issuerBaseUrl: string;
  idempotencyKey: string;
  requestHash: Buffer;
  now: Date;
}>;

export type CreateProjectResult = Readonly<{
  project: ProjectSummary;
  replayed: boolean;
}>;

export interface DeveloperPlatformTransaction {
  findOrganizationIdForProject(projectId: string): Promise<string | undefined>;
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
  }>): Promise<Readonly<{ requestHash: Buffer; project: ProjectSummary }> | undefined>;
  createProject(input: Readonly<{
    id: string;
    environmentId: string;
    organizationId: string;
    name: string;
    issuer: string;
  }>): Promise<ProjectSummary>;
  saveIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    requestHash: Buffer;
    project: ProjectSummary;
    expiresAt: Date;
  }>): Promise<void>;
  appendAuditEvent(input: Readonly<{
    projectId: string;
    actorId: string;
    action: "developer.project.created";
    targetId: string;
    correlationId: string;
  }>): Promise<void>;
}

export interface DeveloperPlatformRepository {
  transaction<T>(operation: (transaction: DeveloperPlatformTransaction) => Promise<T>): Promise<T>;
}

const normalizeProjectName = (name: string): string => name.trim();

const validateProjectName = (name: string): string => {
  const normalized = normalizeProjectName(name);
  if (normalized.length < 1 || normalized.length > 120) {
    throw invalidRequest("Project name must contain between 1 and 120 characters");
  }
  return normalized;
};

export const createProject = async (
  repository: DeveloperPlatformRepository,
  command: CreateProjectCommand
): Promise<CreateProjectResult> =>
  repository.transaction(async (transaction) => {
    const idempotencyScope = {
      principalId: command.actorKeyId,
      projectId: command.authenticatedProjectId,
      route: "/v1/developer/projects",
      key: command.idempotencyKey
    };
    await transaction.lockIdempotencyScope(idempotencyScope);
    const priorResult = await transaction.findIdempotencyRecord({
      ...idempotencyScope,
      now: command.now
    });
    if (priorResult) {
      if (
        priorResult.requestHash.byteLength !== command.requestHash.byteLength ||
        !timingSafeEqual(priorResult.requestHash, command.requestHash)
      ) {
        throw idempotencyKeyReused();
      }
      return { project: priorResult.project, replayed: true };
    }

    const organizationId = await transaction.findOrganizationIdForProject(command.authenticatedProjectId);
    if (!organizationId) {
      throw notFound("Authenticated project is unavailable");
    }

    const project = await transaction.createProject({
      id: randomUUID(),
      environmentId: randomUUID(),
      organizationId,
      name: validateProjectName(command.name),
      issuer: command.issuerBaseUrl
    });

    await transaction.appendAuditEvent({
      projectId: command.authenticatedProjectId,
      actorId: command.actorKeyId,
      action: "developer.project.created",
      targetId: project.id,
      correlationId: command.correlationId
    });

    await transaction.saveIdempotencyRecord({
      ...idempotencyScope,
      requestHash: command.requestHash,
      project,
      expiresAt: new Date(command.now.getTime() + 24 * 60 * 60 * 1_000)
    });

    return { project, replayed: false };
  });
