import { NextResponse } from "next/server";
import { openApiSpec } from "../../../../src/openapi.js";

export const runtime = "nodejs";

// Public OpenAPI document for the HTTP API (no auth required to read the spec).
export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
