import { createHash, randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import {
  ApplicationError,
  invalidCredentials,
  invalidRequest,
  unavailableDependency
} from "../shared/application/errors.js";
import { authenticateSecretApiKey } from "../modules/developer-platform/application/authenticate-secret-key.js";
import {
  createApiKey,
  hashCreateApiKeyRequest,
  type ApiKeyCreationRepository
} from "../modules/developer-platform/application/create-api-key.js";
import {
  createProject,
  type DeveloperPlatformRepository
} from "../modules/developer-platform/application/create-project.js";
import type { SecretApiKeyReader } from "../modules/developer-platform/application/authenticate-secret-key.js";
import type { AppConfig } from "../platform/config.js";
import { Logger } from "../platform/logger.js";
import { hashOpaqueSecret } from "../shared/crypto/opaque-secret.js";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

export type DeveloperPlatformDependencies = Readonly<{
  repository: DeveloperPlatformRepository & SecretApiKeyReader;
  apiKeyCreationRepository?: ApiKeyCreationRepository;
}>;

const createProjectBodySchema = z.object({ name: z.string() }).strict();
const createApiKeyBodySchema = z.object({
  kind: z.enum(["secret", "publishable"]),
  scopes: z.array(z.string().regex(/^[a-z][a-z0-9:_-]{0,63}$/)).max(50).default([])
}).strict();
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{1,255}$/;

export const buildApi = (
  config: AppConfig,
  logger = new Logger(config.logLevel, config.environment),
  developerPlatform?: DeveloperPlatformDependencies
): FastifyInstance => {
  const api = Fastify({ logger: false });

  api.addHook("onRequest", async (request, reply) => {
    const clientRequestId = request.headers["x-request-id"];
    request.requestId =
      typeof clientRequestId === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(clientRequestId)
        ? clientRequestId
        : `req_${randomUUID()}`;
    reply.header("X-Request-Id", request.requestId);
  });

  api.addHook("onResponse", async (request, reply) => {
    logger.info("HTTP request completed", {
      request_id: request.requestId,
      route: request.routeOptions.url,
      status: reply.statusCode,
      latency_ms: reply.elapsedTime
    });
  });

  api.setErrorHandler((error, request, reply) => {
    const applicationError = error instanceof ApplicationError ? error : undefined;
    const status = applicationError?.status ?? 500;
    const code = applicationError?.code ?? "internal_error";
    const title = applicationError?.title ?? "Internal server error";

    if (!applicationError) {
      logger.error("Unhandled request error", {
        request_id: request.requestId,
        route: request.routeOptions.url,
        error_name: error instanceof Error ? error.name : "UnknownError"
      });
    }

    void reply.status(status).type("application/problem+json").send({
      type: `https://authforge.example/problems/${code.replaceAll("_", "-")}`,
      title,
      status,
      code,
      request_id: request.requestId
    });
  });

  api.get("/healthz", async () => ({ status: "ok" }));
  api.get("/readyz", async () => ({ status: "ok" }));

  api.post("/v1/developer/projects", async (request, reply) => {
    const authorization = request.headers.authorization;
    const match = typeof authorization === "string" ? /^Bearer (sk_[A-Za-z0-9_-]{43})$/.exec(authorization) : null;
    const secretApiKey = match?.[1];
    if (!secretApiKey) throw invalidCredentials();
    if (!developerPlatform) throw unavailableDependency();

    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || !idempotencyKeyPattern.test(idempotencyKey)) {
      throw invalidRequest("A valid Idempotency-Key header is required");
    }

    const body = createProjectBodySchema.safeParse(request.body);
    if (!body.success) throw invalidRequest("Request body must contain only a project name");

    const actor = await authenticateSecretApiKey(
      developerPlatform.repository,
      hashOpaqueSecret(secretApiKey, config.apiKeyHashKey),
      "projects:write",
      new Date()
    );
    const result = await createProject(developerPlatform.repository, {
      authenticatedProjectId: actor.projectId,
      actorKeyId: actor.id,
      name: body.data.name,
      correlationId: request.requestId,
      issuerBaseUrl: config.publicIssuerBaseUrl,
      idempotencyKey,
      requestHash: createHash("sha256").update(JSON.stringify(body.data)).digest(),
      now: new Date()
    });

    return reply.status(result.replayed ? 200 : 201).send(result.project);
  });

  api.post("/v1/developer/projects/:projectId/keys", async (request, reply) => {
    const authorization = request.headers.authorization;
    const match = typeof authorization === "string" ? /^Bearer (sk_[A-Za-z0-9_-]{43})$/.exec(authorization) : null;
    const secretApiKey = match?.[1];
    if (!secretApiKey) throw invalidCredentials();
    if (!developerPlatform?.apiKeyCreationRepository) throw unavailableDependency();

    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || !idempotencyKeyPattern.test(idempotencyKey)) {
      throw invalidRequest("A valid Idempotency-Key header is required");
    }

    const params = z.object({ projectId: z.string().uuid() }).safeParse(request.params);
    const body = createApiKeyBodySchema.safeParse(request.body);
    if (!params.success || !body.success) throw invalidRequest("Invalid project key request");
    if (body.data.kind === "secret" && body.data.scopes.length === 0) {
      throw invalidRequest("Secret API keys require at least one scope");
    }
    if (body.data.kind === "publishable" && body.data.scopes.length > 0) {
      throw invalidRequest("Publishable keys cannot have management scopes");
    }

    const now = new Date();
    const actor = await authenticateSecretApiKey(
      developerPlatform.repository,
      hashOpaqueSecret(secretApiKey, config.apiKeyHashKey),
      "keys:write",
      now
    );
    const result = await createApiKey(developerPlatform.apiKeyCreationRepository, {
      authenticatedProjectId: actor.projectId,
      actorKeyId: actor.id,
      targetProjectId: params.data.projectId,
      kind: body.data.kind,
      scopes: body.data.scopes,
      hashKey: config.apiKeyHashKey,
      correlationId: request.requestId,
      idempotencyKey,
      requestHash: hashCreateApiKeyRequest(body.data),
      now
    });
    return reply.status(result.replayed ? 200 : 201).send({
      ...result.key,
      raw_key: result.rawKey
    });
  });

  return api;
};
