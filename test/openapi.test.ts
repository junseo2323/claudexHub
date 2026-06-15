import { describe, it, expect } from "vitest";
import { openApiSpec } from "../src/openapi.js";

describe("openApiSpec", () => {
  it("describes the search endpoint with bearer auth", () => {
    expect(openApiSpec.openapi).toMatch(/^3\./);
    const op = openApiSpec.paths["/api/v1/search"].get;
    expect(op.parameters.some((p) => p.name === "q" && p.required)).toBe(true);
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(["200", "401"]));
    expect(openApiSpec.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
    expect(openApiSpec.components.schemas.CardBrief.required).toContain("confidence");
  });
});
