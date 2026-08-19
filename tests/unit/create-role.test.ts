import { describe, expect, it, vi } from "vitest";

import {
  createRole,
  hashCreateRoleRequest,
  type RoleCreationRepository,
  type RoleCreationTransaction,
  type RoleSummary
} from "../../src/modules/authorization/application/create-role.js";

const role: RoleSummary = { id: "role-1", name: "Reader", description: undefined, permissions: ["profile:read"] };
const command = {
  authenticatedProjectId: "project-1", actorKeyId: "key-1", targetProjectId: "project-1",
  name: " Reader ", description: undefined, permissions: ["profile:read"], correlationId: "request_12345678",
  idempotencyKey: "role-create-001", requestHash: hashCreateRoleRequest({
    name: " Reader ", description: undefined, permissions: ["profile:read"]
  }), now: new Date("2026-08-19T00:00:00.000Z")
};

const createRepository = (): { repository: RoleCreationRepository; transaction: RoleCreationTransaction } => {
  let prior: Readonly<{ requestHash: Buffer; role: RoleSummary }> | undefined;
  const transaction: RoleCreationTransaction = {
    lockIdempotencyScope: async () => undefined,
    findIdempotencyRecord: async () => prior,
    findKnownPermissions: async (codes) => codes,
    createRole: async () => role,
    appendAuditEvent: async () => undefined,
    appendOutboxEvent: async () => undefined,
    saveIdempotencyRecord: async (input) => { prior = { requestHash: input.requestHash, role: input.role }; }
  };
  return { repository: { transaction: async (operation) => operation(transaction) }, transaction };
};

describe("createRole", () => {
  it("creates a scoped role with audit and outbox records", async () => {
    const { repository, transaction } = createRepository();
    const create = vi.spyOn(transaction, "createRole");
    const audit = vi.spyOn(transaction, "appendAuditEvent");

    await expect(createRole(repository, command)).resolves.toEqual({ role, replayed: false });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ projectId: "project-1", name: "Reader" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1", actorKeyId: "key-1", action: "authorization.role.created", roleId: "role-1"
    }));
  });

  it("rejects unknown permissions and cross-project writes", async () => {
    const { repository, transaction } = createRepository();
    transaction.findKnownPermissions = async () => [];

    await expect(createRole(repository, command)).rejects.toMatchObject({ status: 400, code: "invalid_request" });
    await expect(createRole(repository, { ...command, targetProjectId: "project-2" })).rejects.toMatchObject({
      status: 404, code: "not_found"
    });
  });
});
