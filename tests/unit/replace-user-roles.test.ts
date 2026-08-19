import { describe, expect, it, vi } from "vitest";

import {
  replaceUserRoles,
  type UserRoleAssignmentRepository,
  type UserRoleAssignmentTransaction
} from "../../src/modules/authorization/application/replace-user-roles.js";

const command = {
  authenticatedProjectId: "project-1", actorKeyId: "key-1", targetProjectId: "project-1", userId: "user-1",
  roleIds: ["role-1"], correlationId: "request_12345678", idempotencyKey: "role-assignment-001",
  now: new Date("2026-08-19T00:00:00.000Z")
};

const createRepository = (): { repository: UserRoleAssignmentRepository; transaction: UserRoleAssignmentTransaction } => {
  const transaction: UserRoleAssignmentTransaction = {
    lockIdempotencyScope: async () => undefined,
    findIdempotencyRecord: async () => undefined,
    findRoleIds: async (input) => input.roleIds,
    replaceUserRoles: async () => undefined,
    appendAuditEvent: async () => undefined,
    appendOutboxEvent: async () => undefined,
    saveIdempotencyRecord: async () => undefined
  };
  return { repository: { transaction: async (operation) => operation(transaction) }, transaction };
};

describe("replaceUserRoles", () => {
  it("replaces assignments only after resolving the user through identity", async () => {
    const { repository, transaction } = createRepository();
    const replace = vi.spyOn(transaction, "replaceUserRoles");
    const users = { findUserInProject: async () => true };

    await expect(replaceUserRoles(repository, users, command)).resolves.toEqual(["role-1"]);
    expect(replace).toHaveBeenCalledWith({ projectId: "project-1", userId: "user-1", roleIds: ["role-1"] });
  });

  it("does not reveal users or roles from another project", async () => {
    const { repository } = createRepository();
    const users = { findUserInProject: async () => false };

    await expect(replaceUserRoles(repository, users, command)).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(replaceUserRoles(repository, { findUserInProject: async () => true }, {
      ...command, targetProjectId: "project-2"
    })).rejects.toMatchObject({ status: 404, code: "not_found" });
  });
});
