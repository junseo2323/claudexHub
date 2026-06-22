/** OpenAPI 3.0 description of the public HTTP API (token-authenticated). */
export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "ClaudexHub API",
    version: "1.0.0",
    description:
      "Programmatic (non-MCP) access to ClaudexHub. Authenticate with a bearer token created at /settings/tokens. Results respect the token owner's visibility.",
  },
  servers: [{ url: "/" }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/v1/search": {
      get: {
        summary: "Search context cards",
        description: "Hybrid keyword + semantic search. Returns token-cheap briefs, never full card bodies.",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Query text." },
          { name: "stack", in: "query", required: false, schema: { type: "string" }, description: "Comma-separated stack filter." },
          { name: "min", in: "query", required: false, schema: { type: "integer", minimum: 0, maximum: 100 }, description: "Minimum confidence." },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 10, default: 10 } },
        ],
        responses: {
          "200": {
            description: "Search results.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { results: { type: "array", items: { $ref: "#/components/schemas/CardBrief" } } },
                  required: ["results"],
                },
              },
            },
          },
          "400": { description: "Missing query parameter 'q'." },
          "401": { description: "Missing or invalid bearer token." },
          "429": { description: "Rate limit exceeded (see Retry-After)." },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", description: "An API token created at /settings/tokens." },
    },
    schemas: {
      CardBrief: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          confidence: { type: "integer", description: "0-100 search-time confidence." },
          tokens_estimate: { type: "integer" },
          match_reason: { type: "string" },
          fix_summary: { type: "array", items: { type: "string" } },
          risk: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["id", "title", "confidence", "tokens_estimate", "match_reason", "fix_summary", "risk"],
      },
    },
  },
} as const;
