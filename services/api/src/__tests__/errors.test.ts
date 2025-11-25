import { describe, expect, it } from "vitest";
import { Errors, NovaError, mapErrorToResponse } from "../errors.js";

describe("API errors", () => {
  it("creates typed NovaError instances", () => {
    const err = Errors.validation("Invalid payload", { field: "email" });
    expect(err).toBeInstanceOf(NovaError);
    expect(err.code).toBe("VALIDATION");
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: "email" });
  });

  it("maps NovaError to HTTP payload", () => {
    const err = Errors.authz("Nope");
    const response = mapErrorToResponse(err);
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "AUTHZ",
        message: "Nope",
        details: undefined
      }
    });
  });

  it("falls back to 500 for unexpected errors", () => {
    const response = mapErrorToResponse(new Error("boom"));
    expect(response.statusCode).toBe(500);
    expect(response.body.error).toEqual({ code: "INTERNAL", message: "Unexpected error" });
  });
});
