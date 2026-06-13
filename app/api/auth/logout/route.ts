import { NextResponse, type NextRequest } from "next/server";
import { sessionCookie } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(`${req.nextUrl.origin}/`);
  res.cookies.delete(sessionCookie.name);
  return res;
}
