import { invalidRequest, notFound } from "../../../shared/application/errors.js";

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
  issuer: string;
}>;

export interface DeveloperPlatformTransaction {
  findOrganizationIdForProject(projectId: string): Promise<string | undefined>;
  createProject(input: Readonly<{ organizationId: string; name: string; issuer: string }>): Promise<ProjectSummary>;
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
): Promise<ProjectSummary> =>
  repository.transaction(async (transaction) => {
    const organizationId = await transaction.findOrganizationIdForProject(command.authenticatedProjectId);
    if (!organizationId) {
      throw notFound("Authenticated project is unavailable");
    }

    const project = await transaction.createProject({
      organizationId,
      name: validateProjectName(command.name),
      issuer: command.issuer
    });

    await transaction.appendAuditEvent({
      projectId: command.authenticatedProjectId,
      actorId: command.actorKeyId,
      action: "developer.project.created",
      targetId: project.id,
      correlationId: command.correlationId
    });

    return project;
  });
