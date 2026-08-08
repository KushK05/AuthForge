export type ProblemCode =
  | "internal_error"
  | "invalid_request"
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
