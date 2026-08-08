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
  issuerBaseUrl: "https://authforge.test",
  idempotencyKey: "key_12345678",
  requestHash: Buffer.from("request-hash"),
  now: new Date("2026-08-08T00:00:00.000Z")
};

const createRepository = (organizationId: string | undefined): {
  repository: DeveloperPlatformRepository;
  transaction: DeveloperPlatformTransaction;
} => {
  const transaction: DeveloperPlatformTransaction = {
    findOrganizationIdForProject: async () => organizationId,
    lockIdempotencyScope: async () => undefined,
    findIdempotencyRecord: async () => undefined,
    createProject: async () => createdProject,
    saveIdempotencyRecord: async () => undefined,
    appendAuditEvent: async () => undefined
  };

  return { repository: { transaction: async (operation) => operation(transaction) }, transaction };
};

describe("createProject", () => {
  it("derives the organization from the authenticated project and appends an audit event", async () => {
    const { repository, transaction } = createRepository("organization-1");
    const create = vi.spyOn(transaction, "createProject");
    const audit = vi.spyOn(transaction, "appendAuditEvent");

    await expect(createProject(repository, command)).resolves.toEqual({
      project: createdProject,
      replayed: false
    });
    expect(create).toHaveBeenCalledWith({
      organizationId: "organization-1",
      name: "New Project",
      id: expect.any(String),
      environmentId: expect.any(String),
      issuer: command.issuerBaseUrl
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

  it("replays the prior result without repeating a mutation", async () => {
    const { repository, transaction } = createRepository("organization-1");
    transaction.findIdempotencyRecord = async () => ({
      requestHash: command.requestHash,
      project: createdProject
    });
    const create = vi.spyOn(transaction, "createProject");

    await expect(createProject(repository, command)).resolves.toEqual({
      project: createdProject,
      replayed: true
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a reused idempotency key with a different request", async () => {
    const { repository, transaction } = createRepository("organization-1");
    transaction.findIdempotencyRecord = async () => ({
      requestHash: Buffer.from("prior-request-hash"),
      project: createdProject
    });

    await expect(createProject(repository, command)).rejects.toMatchObject({
      status: 409,
      code: "idempotency_key_reused"
    });
  });
});
