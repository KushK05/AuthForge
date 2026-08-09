import { createHash, timingSafeEqual } from "node:crypto";

import { idempotencyKeyReused, invalidRequest, notFound } from "../../../shared/application/errors.js";

export type ReplaceRedirectUrlsCommand = Readonly<{
  authenticatedProjectId: string;
  actorKeyId: string;
  targetProjectId: string;
  urls: readonly string[];
  environment: "development" | "test" | "staging" | "production";
  correlationId: string;
  idempotencyKey: string;
  now: Date;
}>;

export interface RedirectUrlTransaction {
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
  }>): Promise<Readonly<{ requestHash: Buffer; urls: readonly string[] }> | undefined>;
  findProjectInOrganization(input: Readonly<{
    authenticatedProjectId: string;
    targetProjectId: string;
  }>): Promise<string | undefined>;
  replaceRedirectUrls(input: Readonly<{ projectId: string; urls: readonly string[] }>): Promise<void>;
  appendAuditEvent(input: Readonly<{
    projectId: string;
    actorId: string;
    action: "developer.redirect_urls.replaced";
    correlationId: string;
  }>): Promise<void>;
  saveIdempotencyRecord(input: Readonly<{
    principalId: string;
    projectId: string;
    route: string;
    key: string;
    requestHash: Buffer;
    urls: readonly string[];
    expiresAt: Date;
  }>): Promise<void>;
}

export interface RedirectUrlRepository {
  transaction<T>(operation: (transaction: RedirectUrlTransaction) => Promise<T>): Promise<T>;
}

const routeFor = (projectId: string): string => `/v1/developer/projects/${projectId}/redirect-urls`;
const isLoopbackHost = (hostname: string): boolean =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

export const normalizeRedirectUrls = (
  urls: readonly string[],
  environment: ReplaceRedirectUrlsCommand["environment"]
): readonly string[] => {
  const normalized = urls.map((value) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw invalidRequest("Redirect URLs must be absolute URLs");
    }
    if (parsed.username || parsed.password || parsed.hash) {
      throw invalidRequest("Redirect URLs cannot contain credentials or fragments");
    }
    const loopbackHttp = environment === "development" && parsed.protocol === "http:" && isLoopbackHost(parsed.hostname);
    if (parsed.protocol !== "https:" && !loopbackHttp) {
      throw invalidRequest("Redirect URLs must use HTTPS except for local development loopback URLs");
    }
    if (environment !== "development" && isLoopbackHost(parsed.hostname)) {
      throw invalidRequest("Loopback redirect URLs are only allowed in development");
    }
    if (parsed.href.length > 2_048) throw invalidRequest("Redirect URL exceeds the maximum length");
    return parsed.href;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw invalidRequest("Redirect URLs must be unique after normalization");
  }
  return normalized;
};

export const replaceRedirectUrls = async (
  repository: RedirectUrlRepository,
  command: ReplaceRedirectUrlsCommand
): Promise<readonly string[]> =>
  repository.transaction(async (transaction) => {
    const urls = normalizeRedirectUrls(command.urls, command.environment);
    const scope = {
      principalId: command.actorKeyId,
      projectId: command.authenticatedProjectId,
      route: routeFor(command.targetProjectId),
      key: command.idempotencyKey
    };
    const requestHash = createHash("sha256").update(JSON.stringify({ urls })).digest();
    await transaction.lockIdempotencyScope(scope);
    const prior = await transaction.findIdempotencyRecord({ ...scope, now: command.now });
    if (prior) {
      if (
        prior.requestHash.byteLength !== requestHash.byteLength ||
        !timingSafeEqual(prior.requestHash, requestHash)
      ) {
        throw idempotencyKeyReused();
      }
      return prior.urls;
    }

    const projectId = await transaction.findProjectInOrganization({
      authenticatedProjectId: command.authenticatedProjectId,
      targetProjectId: command.targetProjectId
    });
    if (!projectId) throw notFound("Project is unavailable");
    await transaction.replaceRedirectUrls({ projectId, urls });
    await transaction.appendAuditEvent({
      projectId,
      actorId: command.actorKeyId,
      action: "developer.redirect_urls.replaced",
      correlationId: command.correlationId
    });
    await transaction.saveIdempotencyRecord({
      ...scope,
      requestHash,
      urls,
      expiresAt: new Date(command.now.getTime() + 24 * 60 * 60 * 1_000)
    });
    return urls;
  });
