import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, publicOrigin } from "../../../lib/auth";
import { createApiToken } from "../../../lib/hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * CLI login bridge. The `context-hub-cli login` command starts a loopback HTTP
 * server and opens the browser here with `?port=&state=&name=`. Once the user is
 * authenticated we mint an API token and 302 it back to the loopback listener,
 * which the CLI captures and stores. The token only ever travels to 127.0.0.1
 * on the CLI-supplied port, and the `state` nonce ties the response to the
 * request the CLI initiated.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const port = Number(params.get("port"));
  const state = params.get("state") ?? "";
  const name = (params.get("name") || "cli").slice(0, 60);

  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !state) {
    return NextResponse.json({ error: "invalid_cli_params" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    // Bounce through login, then come back here to mint the token.
    const next = `/settings/tokens/cli?${params.toString()}`;
    return NextResponse.redirect(
      `${publicOrigin(req)}/login?next=${encodeURIComponent(next)}`,
    );
  }

  const { plaintext } = createApiToken(user.id, name);

  const back = new URL(`http://127.0.0.1:${port}/`);
  back.searchParams.set("state", state);
  back.searchParams.set("token", plaintext);
  back.searchParams.set("login", user.login);
  return NextResponse.redirect(back.toString());
}
