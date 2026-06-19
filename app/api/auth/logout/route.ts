import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin, sessionCookie } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(`${publicOrigin(req)}/`);
  res.cookies.delete(sessionCookie.name);
  return res;
}
