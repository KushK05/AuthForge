import { describe, expect, it, vi } from "vitest";

import {
  createProject,
  type DeveloperPlatformRepository,
  type DeveloperPlatformTransaction,
  type ProjectSummary
} from "../../src/modules/developer-platform/application/create-project.js";

const createdProject: ProjectSummary = {
  id: "new-project",
  name: "New Project",
  status: "active",
  defaultEnvironment: {
    id: "new-environment",
    name: "development",
    issuer: "https://authforge.test/projects/new-project",
    audience: "new-environment"
  }
};

const command = {
  authenticatedProjectId: "authenticated-project",
  actorKeyId: "key-1",
  name: "  New Project  ",
  correlationId: "request_12345678",
  issuer: "https://authforge.test/projects/new-project"
};

const createRepository = (organizationId: string | undefined): {
  repository: DeveloperPlatformRepository;
  transaction: DeveloperPlatformTransaction;
} => {
  const transaction: DeveloperPlatformTransaction = {
    findOrganizationIdForProject: async () => organizationId,
    createProject: async () => createdProject,
    appendAuditEvent: async () => undefined
  };

  return { repository: { transaction: async (operation) => operation(transaction) }, transaction };
};

describe("createProject", () => {
  it("derives the organization from the authenticated project and appends an audit event", async () => {
    const { repository, transaction } = createRepository("organization-1");
    const create = vi.spyOn(transaction, "createProject");
    const audit = vi.spyOn(transaction, "appendAuditEvent");

    await expect(createProject(repository, command)).resolves.toEqual(createdProject);
    expect(create).toHaveBeenCalledWith({
      organizationId: "organization-1",
      name: "New Project",
      issuer: command.issuer
    });
    expect(audit).toHaveBeenCalledWith({
      projectId: command.authenticatedProjectId,
      actorId: command.actorKeyId,
      action: "developer.project.created",
      targetId: createdProject.id,
      correlationId: command.correlationId
    });
  });

  it("does not reveal an unavailable authenticated project", async () => {
    const { repository } = createRepository(undefined);

    await expect(createProject(repository, command)).rejects.toMatchObject({
      status: 404,
      code: "not_found"
    });
  });

  it("rejects blank project names", async () => {
    const { repository } = createRepository("organization-1");

    await expect(createProject(repository, { ...command, name: " " })).rejects.toMatchObject({
      status: 400,
      code: "invalid_request"
    });
  });
});
