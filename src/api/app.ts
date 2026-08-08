import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";

import { ApplicationError } from "../shared/application/errors.js";
import type { AppConfig } from "../platform/config.js";
import { Logger } from "../platform/logger.js";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

export const buildApi = (config: AppConfig, logger = new Logger(config.logLevel, config.environment)): FastifyInstance => {
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

  return api;
};
