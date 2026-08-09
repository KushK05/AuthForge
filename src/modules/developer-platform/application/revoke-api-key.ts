import { createHash, timingSafeEqual } from "node:crypto";

import { idempotencyKeyReused, notFound } from "../../../shared/application/errors.js";
import type { ApiKeySummary } from "./create-api-key.js";

export type RevokeApiKeyCommand = Readonly<{
  authenticatedProjectId: string;
  actorKeyId: string;
  targetProjectId: string;
  targetKeyId: string;
  correlationId: string;
  idempotencyKey: string;
  now: Date;
}>;

export interface ApiKeyRevocationTransaction {
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
  }>): Promise<Readonly<{ requestHash: Buffer; key: ApiKeySummary }> | undefined>;
  findProjectInOrganization(input: Readonly<{
    authenticatedProjectId: string;
    targetProjectId: string;
  }>): Promise<string | undefined>;
  findApiKey(input: Readonly<{ projectId: string; keyId: string }>): Promise<ApiKeySummary | undefined>;
  revokeApiKey(input: Readonly<{ projectId: string; keyId: string; now: Date }>): Promise<boolean>;
  appendAuditEvent(input: Readonly<{
    projectId: string;
    actorId: string;
    action: "developer.api_key.revoked";
    targetId: string;
    correlationId: string;
  }>): Promise<void>;
  saveIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    requestHash: Buffer;
    response: ApiKeySummary;
    expiresAt: Date;
  }>): Promise<void>;
}

export interface ApiKeyRevocationRepository {
  transaction<T>(operation: (transaction: ApiKeyRevocationTransaction) => Promise<T>): Promise<T>;
}

const routeFor = (projectId: string, keyId: string): string => `/v1/developer/projects/${projectId}/keys/${keyId}`;
const requestHash = (): Buffer => createHash("sha256").update("revoke-api-key").digest();

export const revokeApiKey = async (
  repository: ApiKeyRevocationRepository,
  command: RevokeApiKeyCommand
): Promise<void> =>
  repository.transaction(async (transaction) => {
    const scope = {
      principalId: command.actorKeyId,
      projectId: command.authenticatedProjectId,
      route: routeFor(command.targetProjectId, command.targetKeyId),
      key: command.idempotencyKey
    };
    const hash = requestHash();
    await transaction.lockIdempotencyScope(scope);
    const prior = await transaction.findIdempotencyRecord({ ...scope, now: command.now });
    if (prior) {
      if (!timingSafeEqual(prior.requestHash, hash)) throw idempotencyKeyReused();
      return;
    }

    const projectId = await transaction.findProjectInOrganization({
      authenticatedProjectId: command.authenticatedProjectId,
      targetProjectId: command.targetProjectId
    });
    if (!projectId) throw notFound("Project is unavailable");
    const target = await transaction.findApiKey({ projectId, keyId: command.targetKeyId });
    if (!target) throw notFound("API key is unavailable");

    if (await transaction.revokeApiKey({ projectId, keyId: target.id, now: command.now })) {
      await transaction.appendAuditEvent({
        projectId,
        actorId: command.actorKeyId,
        action: "developer.api_key.revoked",
        targetId: target.id,
        correlationId: command.correlationId
      });
    }
    await transaction.saveIdempotencyRecord({
      ...scope,
      requestHash: hash,
      response: target,
      expiresAt: new Date(command.now.getTime() + 24 * 60 * 60 * 1_000)
    });
  });
