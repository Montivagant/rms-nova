export type ErrorCode =
  | "VALIDATION"
  | "AUTHN"
  | "AUTHZ"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "INTERNAL";

export class NovaError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "NovaError";
  }
}

export const Errors = {
  validation: (message: string, details?: Record<string, unknown>) =>
    new NovaError("VALIDATION", message, 400, details),
  authn: (message = "Authentication required") => new NovaError("AUTHN", message, 401),
  authz: (message = "Not authorized") => new NovaError("AUTHZ", message, 403),
  notFound: (message = "Resource not found") => new NovaError("NOT_FOUND", message, 404),
  conflict: (message = "Resource conflict") => new NovaError("CONFLICT", message, 409),
  rateLimit: (message = "Too many requests") => new NovaError("RATE_LIMIT", message, 429),
  internal: (message = "Unexpected error") => new NovaError("INTERNAL", message, 500)
};

export const mapErrorToResponse = (error: unknown): {
  statusCode: number;
  body: { error: { code: ErrorCode; message: string; details?: Record<string, unknown> } };
} => {
  if (error instanceof NovaError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: "INTERNAL",
        message: "Unexpected error"
      }
    }
  };
};
