import { NextResponse } from "next/server";
import { getHealth } from "../../lib/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = getHealth();
  const ok = health.ok && !health.warnings.some((w) => w.level === "error");
  return NextResponse.json(health, { status: ok ? 200 : 503 });
}
