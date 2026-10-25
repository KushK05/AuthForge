export type ErrorCode =
  | "invalid_user_credentials"
  | "conflict"
  | "internal_error"
  | "invalid_request"
  | "invalid_credentials"
  | "invalid_api_key"
  | "invalid_session"
  | "invalid_console_access"
  | "invalid_console_session"
  | "invalid_csrf"
  | "not_found"
  | "capacity_exceeded"
  | "rate_limited"
  | "dependency_unavailable";

export class ApplicationError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export const invalidRequest = (message: string): ApplicationError =>
  new ApplicationError(400, "invalid_request", message);

export const invalidCredentials = (
  code: Extract<
    ErrorCode,
    "invalid_user_credentials" | "invalid_credentials" | "invalid_api_key" | "invalid_session" | "invalid_console_access" | "invalid_console_session"
  > = "invalid_credentials"
): ApplicationError => {
  const messages: Record<string, string> = {
    invalid_user_credentials: "Invalid demo email or password.",
    invalid_credentials: "Authentication failed",
    invalid_api_key: "The supplied API key is invalid.",
    invalid_session: "The supplied session is invalid or expired.",
    invalid_console_access: "Invalid console access code.",
    invalid_console_session: "Invalid or expired console session."
  };
  return new ApplicationError(401, code, messages[code] ?? "Authentication failed");
};

export const invalidCsrf = (): ApplicationError =>
  new ApplicationError(403, "invalid_csrf", "CSRF validation failed");

export const notFound = (): ApplicationError =>
  new ApplicationError(404, "not_found", "Resource not found");

export const capacityExceeded = (): ApplicationError =>
  new ApplicationError(429, "capacity_exceeded", "Showcase capacity exceeded");

export const rateLimited = (): ApplicationError =>
  new ApplicationError(429, "rate_limited", "Too many authentication attempts");

export const unavailableDependency = (): ApplicationError =>
  new ApplicationError(503, "dependency_unavailable", "A required dependency is unavailable");

export const conflict = (): ApplicationError => new ApplicationError(409, "conflict", "This demo email is already registered");
