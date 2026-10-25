import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";

import {
  ApplicationError,
  invalidCredentials,
  invalidRequest,
  invalidCsrf,
  notFound,
  unavailableDependency
} from "../shared/application/errors.js";
import { hashOpaqueSecret } from "../shared/crypto/opaque-secret.js";
import type { AppConfig } from "../platform/config.js";
import { noValidationHints, type ValidationHints } from "../platform/validation-hints.js";
import { Logger } from "../platform/logger.js";
import { ApiKeyService } from "../modules/api-keys/api-key-service.js";
import { ConsoleService } from "../modules/developer-console/console-service.js";
import { type IssuedSession, SessionService } from "../modules/sessions/session-service.js";
import { UserService } from "../modules/users/user-service.js";
import { authClient, authPage } from "./auth-page.js";
import { dashboardClient, dashboardPage } from "./dashboard-page.js";
import { type ConsoleRateLimiter, MemoryConsoleRateLimiter } from "../platform/redis.js";
import type { ApiKeyRecord, ApplicationSessionRecord, ConsoleSessionRecord, ShowcaseStore } from "../platform/store.js";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

const cookieName = "authforge_console";
const userCookieName = "authforge_user";

const parseCookie = (header: string | undefined, name: string): string | undefined => {
  const pair = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return pair?.slice(name.length + 1);
};

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

const issuedSessionBody = (issued: IssuedSession) => ({
  ...publicSession(issued.session),
  token: issued.token
});

const getOrigin = (request: FastifyRequest): string | undefined => {
  const origin = request.headers.origin;
  return typeof origin === "string" ? origin : undefined;
};

export const buildApi = (
  config: AppConfig,
  store: ShowcaseStore,
  rateLimiter: ConsoleRateLimiter = new MemoryConsoleRateLimiter(),
  logger = new Logger(config.logLevel, config.environment),
  validationHints: ValidationHints = noValidationHints
): FastifyInstance => {
  // AWS has exactly two trusted hops: ALB and CloudFront. Never trust the
  // viewer-supplied prefix of X-Forwarded-For.
  const api = Fastify({ logger: false, bodyLimit: config.maxRequestBodyBytes ?? 16384, trustProxy: config.trustProxy ? (_address: string, hop: number) => hop < 2 : false });
  const consoleService = new ConsoleService(config, store, rateLimiter);
  const apiKeyService = new ApiKeyService(config, store);
  const sessionService = new SessionService(config, store);
  const userService = new UserService(config, store);

  api.addHook("onRequest", async (request, reply) => {
    const supplied = request.headers["x-request-id"];
    request.requestId = typeof supplied === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(supplied)
      ? supplied
      : `req_${randomUUID()}`;
    reply.header("X-Request-Id", request.requestId);
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
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
    if (!(error instanceof ApplicationError)) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode && statusCode >= 400 && statusCode < 500) error = invalidRequest("Invalid HTTP request");
      else if (/^(ECONN|ETIMEDOUT|ENOTFOUND|CONNECTION_|57P0|53300|080)/.test(String((error as { code?: string }).code ?? ""))) error = unavailableDependency();
    }
    const known = error instanceof ApplicationError ? error : undefined;
    const status = known ? known.status : 500;
    const code = known ? known.code : "internal_error";
    if (!known) {
      logger.error("Unhandled request error", {
        request_id: request.requestId,
        error_name: error instanceof Error ? error.name : "UnknownError"
      });
    }
    void reply.status(status).send({
      error: {
        code,
        message: known ? known.message : "Internal server error",
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
  api.get("/", async (_request, reply) => {
    reply.header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    reply.header("Cache-Control", "no-store");
    return reply.type("text/html; charset=utf-8").send(authPage);
  });
  api.get("/console", async (_request, reply) => { reply.header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"); reply.header("Cache-Control", "no-store"); return reply.type("text/html; charset=utf-8").send(dashboardPage); });
  api.get("/dashboard.js", async (_request, reply) => {
    reply.header("Content-Security-Policy", "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    reply.header("Cache-Control", "no-store");
    return reply.type("application/javascript; charset=utf-8").send(dashboardClient);
  });
  api.get("/auth.js", async (_request, reply) => { reply.header("Content-Security-Policy", "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"); reply.header("Cache-Control", "no-store"); return reply.type("application/javascript; charset=utf-8").send(`${authClient};document.head.insertAdjacentHTML('beforeend','<style>.layout>section:first-child:before{display:none}@media(max-width:850px){.layout{grid-template-columns:minmax(0,1fr);gap:46px}}@media(max-width:520px){.layout{gap:34px}.layout>section:first-child{padding:32px 0 34px}.layout>section:first-child:before{display:none}h1{font-size:clamp(43px,13vw,54px)}.lead{margin:20px 0 28px}.proof{gap:15px}.card{padding:24px;box-shadow:10px 10px 0 #182c36}}</style>');`); });
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

  const userCookie = (token: string, maxAge: number): string => `${userCookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secureCookies ? "; Secure" : ""}`;
  const throttleUserAuth = async (request: FastifyRequest): Promise<string> => {
    if (getOrigin(request) !== config.consoleOrigin) throw invalidCsrf();
    const bucket = `auth:${digest(request.ip, config).toString("hex")}`;
    await rateLimiter.assertAllowed(bucket);
    await rateLimiter.recordFailure(bucket);
    return bucket;
  };
  api.post("/v1/auth/register", async (request, reply) => {
    await throttleUserAuth(request);
    const body = z.object({ email: z.string().max(254), password: z.string().max(256) }).strict().safeParse(request.body);
    if (!body.success) throw invalidRequest("Invalid registration request");
    const issued = await userService.register(body.data.email, body.data.password);
    reply.header("Set-Cookie", userCookie(issued.token, 3600)); reply.header("Cache-Control", "no-store");
    return reply.status(201).send({ user: { id: issued.user.id, email: issued.user.email }, csrf_token: issued.csrfToken });
  });
  api.post("/v1/auth/login", async (request, reply) => {
    await throttleUserAuth(request);
    const body = z.object({ email: z.string().max(254), password: z.string().max(256) }).strict().safeParse(request.body);
    if (!body.success) throw invalidRequest("Invalid sign-in request");
    const issued = await userService.login(body.data.email, body.data.password);
    reply.header("Set-Cookie", userCookie(issued.token, 3600)); reply.header("Cache-Control", "no-store");
    return reply.send({ user: { id: issued.user.id, email: issued.user.email }, csrf_token: issued.csrfToken });
  });
  api.get("/v1/auth/me", async (request) => {
    const origin = getOrigin(request);
    if (origin !== undefined && origin !== config.consoleOrigin) throw invalidCsrf();
    const current = await userService.authenticate(parseCookie(request.headers.cookie, userCookieName));
    return { user: { id: current.user.id, email: current.user.email }, csrf_token: current.csrfToken };
  });
  api.delete("/v1/auth/session", async (request, reply) => {
    const current = await userService.authenticate(parseCookie(request.headers.cookie, userCookieName));
    const csrf = typeof request.headers["x-csrf-token"] === "string" ? request.headers["x-csrf-token"] : undefined;
    if (getOrigin(request) !== config.consoleOrigin) throw invalidCsrf();
    userService.verifyCsrf(current.session, csrf); await store.revokeUserSession(current.session.id, new Date());
    reply.header("Set-Cookie", userCookie("", 0)); return reply.status(204).send();
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
      ttl_seconds: z.number().int().min(30).max(config.maxSessionTtlSeconds).optional()
    }).strict().safeParse(request.body);
    if (!body.success) throw invalidRequest("Invalid session request");
    const issued = await sessionService.create(apiKey, body.data.subject, body.data.ttl_seconds);
    reply.header("Cache-Control", "no-store");
    return reply.status(201).send(issuedSessionBody(issued));
  });

  api.post("/v1/sessions/validate", async (request) => {
    const apiKey = await requireApiKey(request);
    const body = z.object({ token: z.string().min(1).max(512) }).strict().safeParse(request.body);
    if (!body.success) throw invalidRequest("Invalid session validation request");
    const tokenDigest = digest(body.data.token, config);
    const hint = await validationHints.get(apiKey.id, tokenDigest);
    const session = await store.findSession(apiKey.id, tokenDigest, new Date());
    if (!session) {
      await validationHints.forget(apiKey.id, tokenDigest);
      throw invalidCredentials("invalid_session");
    }
    await validationHints.remember(apiKey.id, tokenDigest, session.id, session.expiresAt);
    logger.debug("Session validated against PostgreSQL", {validation_cache: hint === session.id ? "hit" : "miss"});
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

  api.setNotFoundHandler(() => { throw notFound(); });
  return api;
};
