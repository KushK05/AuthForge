import type { FastifyInstance } from "fastify";

import type { FakeAuthEmailSender } from "./fake-auth-email-sender.js";

export type DemoUserSignIn = Readonly<{ cookie: string; csrf: string; email: string }>;

export const demoPassword = "a-demo-password-123";

/** Registers a demo user, verifies the captured email token, and returns the browser session. */
export const signInDemoUser = async (
  app: FastifyInstance,
  sender: FakeAuthEmailSender,
  origin: string,
  email = "learner@authforge.demo"
): Promise<DemoUserSignIn> => {
  const headers = { origin };
  const registered = await app.inject({ method: "POST", url: "/v1/auth/register", headers, payload: { email, password: demoPassword } });
  if (registered.statusCode !== 202) throw new Error(`registration failed with ${registered.statusCode}`);
  const token = sender.verificationTokens.at(-1);
  if (!token) throw new Error("no verification email captured");
  const verified = await app.inject({ method: "POST", url: "/v1/auth/verify-email", headers, payload: { token } });
  if (verified.statusCode !== 200) throw new Error(`verification failed with ${verified.statusCode}`);
  return {
    cookie: String(verified.headers["set-cookie"]).split(";")[0]!,
    csrf: verified.json().csrf_token as string,
    email
  };
};
