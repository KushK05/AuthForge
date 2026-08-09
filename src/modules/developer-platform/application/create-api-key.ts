import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { idempotencyKeyReused, notFound } from "../../../shared/application/errors.js";
import { generateApiKey, hashOpaqueSecret, type ApiKeyKind } from "../../../shared/crypto/opaque-secret.js";

export type ApiKeySummary = Readonly<{
  id: string;
  kind: ApiKeyKind;
  prefix: string;
  scopes: readonly string[];
  expiresAt: string | undefined;
}>;

export type CreateApiKeyCommand = Readonly<{
  authenticatedProjectId: string;
  actorKeyId: string;
  targetProjectId: string;
  kind: ApiKeyKind;
  scopes: readonly string[];
  hashKey: string;
  correlationId: string;
  idempotencyKey: string;
  requestHash: Buffer;
  now: Date;
}>;

export type CreateApiKeyResult = Readonly<{
  key: ApiKeySummary;
  rawKey: string | undefined;
  replayed: boolean;
}>;

export interface ApiKeyCreationTransaction {
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
  findDefaultEnvironmentInOrganization(input: Readonly<{
    authenticatedProjectId: string;
    targetProjectId: string;
  }>): Promise<Readonly<{ projectId: string; environmentId: string }> | undefined>;
  createApiKey(input: Readonly<{
    id: string;
    projectId: string;
    environmentId: string;
    kind: ApiKeyKind;
    secretHash: Buffer;
    prefix: string;
    scopes: readonly string[];
  }>): Promise<ApiKeySummary>;
  appendAuditEvent(input: Readonly<{
    projectId: string;
    actorId: string;
    action: "developer.api_key.created";
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

export interface ApiKeyCreationRepository {
  transaction<T>(operation: (transaction: ApiKeyCreationTransaction) => Promise<T>): Promise<T>;
}

const idempotencyRoute = (projectId: string): string => `/v1/developer/projects/${projectId}/keys`;

export const hashCreateApiKeyRequest = (input: Readonly<{ kind: ApiKeyKind; scopes: readonly string[] }>): Buffer =>
  createHash("sha256").update(JSON.stringify(input)).digest();

export const createApiKey = async (
  repository: ApiKeyCreationRepository,
  command: CreateApiKeyCommand
): Promise<CreateApiKeyResult> =>
  repository.transaction(async (transaction) => {
    const scope = {
      principalId: command.actorKeyId,
      projectId: command.authenticatedProjectId,
      route: idempotencyRoute(command.targetProjectId),
      key: command.idempotencyKey
    };
    await transaction.lockIdempotencyScope(scope);
    const prior = await transaction.findIdempotencyRecord({ ...scope, now: command.now });
    if (prior) {
      if (
        prior.requestHash.byteLength !== command.requestHash.byteLength ||
        !timingSafeEqual(prior.requestHash, command.requestHash)
      ) {
        throw idempotencyKeyReused();
      }
      return { key: prior.key, rawKey: undefined, replayed: true };
    }

    const environment = await transaction.findDefaultEnvironmentInOrganization({
      authenticatedProjectId: command.authenticatedProjectId,
      targetProjectId: command.targetProjectId
    });
    if (!environment) throw notFound("Project is unavailable");

    const rawKey = generateApiKey(command.kind);
    const key = await transaction.createApiKey({
      id: randomUUID(),
      projectId: environment.projectId,
      environmentId: environment.environmentId,
      kind: command.kind,
      secretHash: hashOpaqueSecret(rawKey.value, command.hashKey),
      prefix: rawKey.prefix,
      scopes: command.scopes
    });
    await transaction.appendAuditEvent({
      projectId: environment.projectId,
      actorId: command.actorKeyId,
      action: "developer.api_key.created",
      targetId: key.id,
      correlationId: command.correlationId
    });
    await transaction.saveIdempotencyRecord({
      ...scope,
      requestHash: command.requestHash,
      response: key,
      expiresAt: new Date(command.now.getTime() + 24 * 60 * 60 * 1_000)
    });
    return { key, rawKey: rawKey.value, replayed: false };
  });
