import { NextResponse } from "next/server";
import { getHealth } from "../../lib/hub";
import { newRequestId, logEvent } from "../../../src/logger.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const reqId = newRequestId();
  const health = getHealth();
  const ok = health.ok && !health.warnings.some((w) => w.level === "error");
  const status = ok ? 200 : 503;
  logEvent(ok ? "info" : "warn", "api.health", {
    reqId,
    status,
    db: health.db,
    cards: health.cards,
    warnings: health.warnings.length,
  });
  return NextResponse.json(health, { status, headers: { "x-request-id": reqId } });
}
