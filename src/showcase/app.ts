import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";

import { Logger } from "../platform/logger.js";
import { hashOpaqueSecret } from "../shared/crypto/opaque-secret.js";
import type { ShowcaseConfig } from "./config.js";
import type { ApiKeyRecord, ApplicationSessionRecord, ConsoleSessionRecord, ShowcaseStore } from "./store.js";

class ShowcaseError extends Error {
  public constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

const invalidRequest = (message: string): ShowcaseError => new ShowcaseError(400, "invalid_request", message);
const invalidCredentials = (code = "invalid_credentials"): ShowcaseError => new ShowcaseError(401, code, "Authentication failed");
const invalidCsrf = (): ShowcaseError => new ShowcaseError(403, "invalid_csrf", "CSRF validation failed");
const notFound = (): ShowcaseError => new ShowcaseError(404, "not_found", "Resource not found");
const capacityExceeded = (): ShowcaseError => new ShowcaseError(429, "capacity_exceeded", "Showcase capacity exceeded");

const cookieName = "authforge_console";
const parseCookie = (header: string | undefined, name: string): string | undefined => {
  const pair = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return pair?.slice(name.length + 1);
};

const secureEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const rawToken = (prefix: string): string => `${prefix}_${randomBytes(32).toString("base64url")}`;
const digest = (value: string, config: ShowcaseConfig): Buffer => hashOpaqueSecret(value, config.credentialHashKey);
const iso = (value: Date): string => value.toISOString();

const publicApiKey = (record: ApiKeyRecord) => ({
  id: record.id,
  name: record.name,
  prefix: record.prefix,
  created_at: iso(record.createdAt),
  ...(record.revokedAt ? { revoked_at: iso(record.revokedAt) } : {})
});

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

export const buildShowcaseApi = (
  config: ShowcaseConfig,
  store: ShowcaseStore,
  logger = new Logger(config.logLevel, config.environment)
): FastifyInstance => {
  const api = Fastify({ logger: false });
  const consoleAttempts = new Map<string, { count: number; resetAt: number }>();

  api.addHook("onRequest", async (request, reply) => {
    const supplied = request.headers["x-request-id"];
    const requestId = typeof supplied === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(supplied)
      ? supplied
      : `req_${randomUUID()}`;
    request.id = requestId;
    reply.header("X-Request-Id", requestId);
  });

  api.addHook("onResponse", async (request, reply) => {
    logger.info("Showcase request completed", {
      request_id: request.id,
      route: request.routeOptions.url,
      status: reply.statusCode,
      latency_ms: reply.elapsedTime
    });
  });

  api.setErrorHandler((error, request, reply) => {
    const known = error instanceof ShowcaseError;
    const status = known ? error.status : 500;
    const code = known ? error.code : "internal_error";
    if (!known) logger.error("Unhandled showcase request error", {
      request_id: request.id,
      error_name: error instanceof Error ? error.name : "UnknownError"
    });
    void reply.status(status).send({ error: { code, message: known ? error.message : "Internal server error", request_id: request.id } });
  });

  const requireOrigin = (request: FastifyRequest): void => {
    if (getOrigin(request) !== config.consoleOrigin) throw invalidCsrf();
  };

  const requireConsole = async (request: FastifyRequest, mutation: boolean): Promise<ConsoleSessionRecord> => {
    if (mutation) requireOrigin(request);
    const token = parseCookie(request.headers.cookie, cookieName);
    if (!token) throw invalidCredentials("invalid_console_session");
    const session = await store.findConsoleSession(digest(token, config), new Date());
    if (!session) throw invalidCredentials("invalid_console_session");
    if (mutation) {
      const csrf = request.headers["x-csrf-token"];
      if (typeof csrf !== "string" || !session.csrfDigest.equals(digest(csrf, config))) throw invalidCsrf();
    }
    return session;
  };

  const requireApiKey = async (request: FastifyRequest): Promise<ApiKeyRecord> => {
    const authorization = request.headers.authorization;
    const match = typeof authorization === "string" ? /^Bearer (sk_[A-Za-z0-9_-]+)$/.exec(authorization) : null;
    if (!match?.[1]) throw invalidCredentials("invalid_api_key");
    const key = await store.findApiKey(digest(match[1], config), new Date());
    if (!key) throw invalidCredentials("invalid_api_key");
    return key;
  };

  api.get("/health/live", async () => ({ status: "ok" }));
  api.get("/health/ready", async (_request, reply) => {
    await store.ready();
    return reply.send({ status: "ok" });
  });

  api.post("/v1/console/session", async (request, reply) => {
    const body = z.object({ access_code: z.string().min(1).max(256) }).strict().safeParse(request.body);
    if (!body.success) throw invalidRequest("Invalid console access request");
    const now = Date.now();
    const attempt = consoleAttempts.get(request.ip);
    if (attempt && attempt.resetAt > now && attempt.count >= 5) throw new ShowcaseError(429, "rate_limited", "Too many console access attempts");
    if (!secureEqual(body.data.access_code, config.consoleAccessCode)) {
      const next = attempt && attempt.resetAt > now ? { count: attempt.count + 1, resetAt: attempt.resetAt } : { count: 1, resetAt: now + 60_000 };
      consoleAttempts.set(request.ip, next);
      throw invalidCredentials("invalid_console_access");
    }
    consoleAttempts.delete(request.ip);
    if (await store.countConsoleSessions() >= config.maxConsoleSessions) throw capacityExceeded();
    const token = rawToken("cs");
    const csrf = rawToken("csrf");
    const createdAt = new Date();
    await store.createConsoleSession({
      id: randomUUID(),
      tokenDigest: digest(token, config),
      csrfDigest: digest(csrf, config),
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 15 * 60_000)
    });
    const secure = config.secureCookies ? "; Secure" : "";
    reply.header("Set-Cookie", `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=900${secure}`);
    reply.header("Cache-Control", "no-store");
    return reply.send({ csrf_token: csrf });
  });

  api.delete("/v1/console/session", async (request, reply) => {
    const session = await requireConsole(request, true);
    await store.revokeConsoleSession(session.id, new Date());
    reply.header("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    return reply.status(204).send();
  });

  api.get("/v1/console/state", async (request) => {
    await requireConsole(request, false);
    const [keys, sessions] = await Promise.all([store.listApiKeys(), store.listSessions()]);
    return { api_keys: keys.map(publicApiKey), sessions: sessions.map(publicSession) };
  });

  api.post("/v1/api-keys", async (request, reply) => {
    await requireConsole(request, true);
    const body = z.object({ name: z.string().trim().min(1).max(120) }).strict().safeParse(request.body);
    if (!body.success) throw invalidRequest("Invalid API-key request");
    const keys = await store.listApiKeys();
    if (keys.length >= config.maxApiKeys) throw capacityExceeded();
    const secret = rawToken("sk");
    const createdAt = new Date();
    const record: ApiKeyRecord = {
      id: randomUUID(),
      name: body.data.name,
      prefix: secret.slice(0, 11),
      secretDigest: digest(secret, config),
      createdAt
    };
    await store.createApiKey(record);
    reply.header("Cache-Control", "no-store");
    return reply.status(201).send({ ...publicApiKey(record), secret });
  });

  api.get("/v1/api-keys", async (request) => {
    await requireConsole(request, false);
    return { data: (await store.listApiKeys()).map(publicApiKey) };
  });

  api.delete("/v1/api-keys/:keyId", async (request, reply) => {
    await requireConsole(request, true);
    const params = z.object({ keyId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) throw invalidRequest("Invalid API-key identifier");
    await store.revokeApiKey(params.data.keyId, new Date());
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
