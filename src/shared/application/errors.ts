export type ProblemCode =
  | "internal_error"
  | "forbidden"
  | "idempotency_key_reused"
  | "invalid_credentials"
  | "invalid_request"
  | "not_found"
  | "unavailable_dependency";

export class ApplicationError extends Error {
  public readonly status: number;
  public readonly code: ProblemCode;
  public readonly title: string;

  public constructor({
    status,
    code,
    title,
    message
  }: {
    status: number;
    code: ProblemCode;
    title: string;
    message: string;
  }) {
    super(message);
    this.name = "ApplicationError";
    this.status = status;
    this.code = code;
    this.title = title;
  }
}

export const invalidRequest = (message: string): ApplicationError =>
  new ApplicationError({
    status: 400,
    code: "invalid_request",
    title: "Invalid request",
    message
  });

export const notFound = (message: string): ApplicationError =>
  new ApplicationError({
    status: 404,
    code: "not_found",
    title: "Resource not found",
    message
  });

export const forbidden = (message: string): ApplicationError =>
  new ApplicationError({
    status: 403,
    code: "forbidden",
    title: "Forbidden",
    message
  });

export const invalidCredentials = (): ApplicationError =>
  new ApplicationError({
    status: 401,
    code: "invalid_credentials",
    title: "Authentication failed",
    message: "Authentication failed"
  });

export const idempotencyKeyReused = (): ApplicationError =>
  new ApplicationError({
    status: 409,
    code: "idempotency_key_reused",
    title: "Idempotency key reused",
    message: "Idempotency key was used with a different request"
  });

export const unavailableDependency = (): ApplicationError =>
  new ApplicationError({
    status: 503,
    code: "unavailable_dependency",
    title: "Unavailable dependency",
    message: "A required dependency is unavailable"
  });
