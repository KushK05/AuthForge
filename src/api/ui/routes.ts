import type { FastifyInstance } from "fastify";

import { forgotPasswordPage, loginPage, resetPasswordPage, signupPage, verifyEmailPage } from "./auth-pages.js";
import { consoleClient } from "./console-client.js";
import { consolePage } from "./console-page.js";
import { docsPage } from "./docs-page.js";
import { landingPage } from "./landing-page.js";
import { publicClient } from "./public-client.js";

const htmlCsp = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const scriptCsp = "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'";

export const htmlRoutes: ReadonlyArray<readonly [string, string]> = [
  ["/", landingPage],
  ["/signup", signupPage],
  ["/login", loginPage],
  ["/verify-email", verifyEmailPage],
  ["/forgot-password", forgotPasswordPage],
  ["/reset-password", resetPasswordPage],
  ["/docs", docsPage],
  ["/console", consolePage]
];

export const scriptRoutes: ReadonlyArray<readonly [string, string]> = [
  ["/app.js", publicClient],
  ["/dashboard.js", consoleClient]
];

export const registerPageRoutes = (api: FastifyInstance): void => {
  for (const [path, html] of htmlRoutes) {
    api.get(path, async (_request, reply) => {
      reply.header("Content-Security-Policy", htmlCsp);
      reply.header("Cache-Control", "no-store");
      return reply.type("text/html; charset=utf-8").send(html);
    });
  }
  for (const [path, source] of scriptRoutes) {
    api.get(path, async (_request, reply) => {
      reply.header("Content-Security-Policy", scriptCsp);
      reply.header("Cache-Control", "no-store");
      return reply.type("application/javascript; charset=utf-8").send(source);
    });
  }
};
