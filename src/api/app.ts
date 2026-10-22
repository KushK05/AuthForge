import { randomBytes, randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";

import {
  ApplicationError,
  capacityExceeded,
  invalidCredentials,
  invalidRequest,
  notFound,
  unavailableDependency
} from "../shared/application/errors.js";
import { hashOpaqueSecret } from "../shared/crypto/opaque-secret.js";
import type { AppConfig } from "../platform/config.js";
import { Logger } from "../platform/logger.js";
import { ApiKeyService } from "../modules/api-keys/api-key-service.js";
import { ConsoleService } from "../modules/developer-console/console-service.js";
import { type ConsoleRateLimiter, MemoryConsoleRateLimiter } from "../platform/redis.js";
import type { ApiKeyRecord, ApplicationSessionRecord, ConsoleSessionRecord, ShowcaseStore } from "../platform/store.js";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

const cookieName = "authforge_console";

const parseCookie = (header: string | undefined, name: string): string | undefined => {
  const pair = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return pair?.slice(name.length + 1);
};

const rawToken = (prefix: string): string => `${prefix}_${randomBytes(32).toString("base64url")}`;
const digest = (value: string, config: AppConfig): Buffer => hashOpaqueSecret(value, config.credentialHashKey);
const iso = (value: Date): string => value.toISOString();

const publicSession = (record: ApplicationSessionRecord) => ({
  id: record.id,
  api_key_id: record.apiKeyId,
  subject: record.subject,
  created_at: iso(record.createdAt),
  expires_at: iso(record.expiresAt),
  ...(record.revokedAt ? { revoked_at: iso(record.revokedAt) } : {})
});

const getOrigin = (request: FastifyRequest): string | undefined => {
  const origin = request.headers.origin;
  return typeof origin === "string" ? origin : undefined;
};

export const buildApi = (
  config: AppConfig,
  store: ShowcaseStore,
  rateLimiter: ConsoleRateLimiter = new MemoryConsoleRateLimiter(),
  logger = new Logger(config.logLevel, config.environment)
): FastifyInstance => {
  const api = Fastify({ logger: false });
  const consoleService = new ConsoleService(config, store, rateLimiter);
  const apiKeyService = new ApiKeyService(config, store);

  api.addHook("onRequest", async (request, reply) => {
    const supplied = request.headers["x-request-id"];
    request.requestId = typeof supplied === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(supplied)
      ? supplied
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
    const known = error instanceof ApplicationError;
    const status = known ? error.status : 500;
    const code = known ? error.code : "internal_error";
    if (!known) {
      logger.error("Unhandled request error", {
        request_id: request.requestId,
        error_name: error instanceof Error ? error.name : "UnknownError"
      });
    }
    void reply.status(status).send({
      error: {
        code,
        message: known ? error.message : "Internal server error",
        request_id: request.requestId
      }
    });
  });

  const requireConsole = async (request: FastifyRequest, mutation: boolean): Promise<ConsoleSessionRecord> => {
    const token = parseCookie(request.headers.cookie, cookieName);
    const origin = getOrigin(request);
    const csrf = typeof request.headers["x-csrf-token"] === "string" ? request.headers["x-csrf-token"] : undefined;
    return consoleService.verifySession(token, origin, mutation, csrf);
  };

  const requireApiKey = async (request: FastifyRequest): Promise<ApiKeyRecord> => {
    return apiKeyService.authenticateKey(request.headers.authorization);
  };

  api.get("/health/live", async () => ({ status: "ok" }));
  api.get("/health/ready", async (_request, reply) => {
    try {
      await store.ready();
      await rateLimiter.ready();
      return reply.send({ status: "ok" });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw unavailableDependency();
    }
  });

  api.post("/v1/console/session", async (request, reply) => {
    const body = z.object({ access_code: z.string().min(1).max(256) }).strict().safeParse(request.body);
    if (!body.success) throw invalidRequest("Invalid console access request");
    const { token, csrfToken } = await consoleService.login(body.data.access_code, request.ip);
    const secure = config.secureCookies ? "; Secure" : "";
    reply.header("Set-Cookie", `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=900${secure}`);
    reply.header("Cache-Control", "no-store");
    return reply.send({ csrf_token: csrfToken });
  });

  api.delete("/v1/console/session", async (request, reply) => {
    const session = await requireConsole(request, true);
    await consoleService.revokeSession(session.id);
    const secure = config.secureCookies ? "; Secure" : "";
    reply.header("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
    return reply.status(204).send();
  });

  api.get("/v1/console/state", async (request) => {
    await requireConsole(request, false);
    return consoleService.getState();
  });

  api.post("/v1/api-keys", async (request, reply) => {
    await requireConsole(request, true);
    const body = z.object({ name: z.string().trim().min(1).max(120) }).strict().safeParse(request.body);
    if (!body.success) throw invalidRequest("Invalid API-key request");
    const created = await apiKeyService.createKey(body.data.name);
    reply.header("Cache-Control", "no-store");
    return reply.status(201).send(created);
  });

  api.get("/v1/api-keys", async (request) => {
    await requireConsole(request, false);
    return { data: await apiKeyService.listKeys() };
  });

  api.delete("/v1/api-keys/:keyId", async (request, reply) => {
    await requireConsole(request, true);
    const params = z.object({ keyId: z.string() }).safeParse(request.params);
    if (!params.success) throw invalidRequest("Invalid API-key identifier");
    await apiKeyService.revokeKey(params.data.keyId);
    return reply.status(204).send();
  });

  api.post("/v1/sessions", async (request, reply) => {
    const apiKey = await requireApiKey(request);
    const body = z.object({
      subject: z.string().trim().min(1).max(config.maxSubjectLength),
      ttl_seconds: z.coerce.number().int().min(30).max(config.maxSessionTtlSeconds).optional()
    }).strict().safeParse(request.body);
    if (!body.success) throw invalidRequest("Invalid session request");
    if (await store.countSessions() >= config.maxSessions) throw capacityExceeded();
    const token = rawToken("sess");
    const createdAt = new Date();
    const record: ApplicationSessionRecord = {
      id: randomUUID(),
      apiKeyId: apiKey.id,
      subject: body.data.subject,
      tokenDigest: digest(token, config),
      createdAt,
      expiresAt: new Date(createdAt.getTime() + (body.data.ttl_seconds ?? config.defaultSessionTtlSeconds) * 1_000)
    };
    await store.createSession(record);
    reply.header("Cache-Control", "no-store");
    return reply.status(201).send({ ...publicSession(record), token });
  });

  api.post("/v1/sessions/validate", async (request) => {
    const apiKey = await requireApiKey(request);
    const body = z.object({ token: z.string().min(1).max(512) }).strict().safeParse(request.body);
    if (!body.success) throw invalidRequest("Invalid session validation request");
    const session = await store.findSession(apiKey.id, digest(body.data.token, config), new Date());
    if (!session) throw invalidCredentials("invalid_session");
    return { valid: true, session: publicSession(session) };
  });

  api.get("/v1/sessions", async (request) => {
    const apiKey = await requireApiKey(request);
    return { data: (await store.listSessions(apiKey.id)).map(publicSession) };
  });

  api.delete("/v1/sessions/:sessionId", async (request, reply) => {
    const apiKey = await requireApiKey(request);
    const params = z.object({ sessionId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) throw invalidRequest("Invalid session identifier");
    const revoked = await store.revokeSession(params.data.sessionId, apiKey.id, new Date());
    if (!revoked) throw notFound();
    return reply.status(204).send();
  });

  api.delete("/v1/console/sessions/:sessionId", async (request, reply) => {
    await requireConsole(request, true);
    const params = z.object({ sessionId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) throw invalidRequest("Invalid session identifier");
    await store.revokeSession(params.data.sessionId, undefined, new Date());
    return reply.status(204).send();
  });

  return api;
};
