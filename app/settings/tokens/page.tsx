import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import { listApiTokens } from "../../lib/claudexhub";
import { createApiTokenAction, revokeApiTokenAction } from "../../lib/actions";
import { NEW_TOKEN_COOKIE } from "../../lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TokensPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const tokens = listApiTokens(me.id);
  const store = await cookies();
  const newToken = store.get(NEW_TOKEN_COOKIE)?.value;

  return (
    <>
      <h1>API tokens</h1>
      <p className="subtle">
        Use a token to call the HTTP search API:{" "}
        <code>GET /api/v1/search?q=…</code> with{" "}
        <code>Authorization: Bearer &lt;token&gt;</code>. Results respect your visibility.
      </p>

      {newToken && (
        <div className="panel" style={{ borderColor: "var(--accent)", marginTop: 16 }}>
          <strong>New token — copy it now, it won't be shown again:</strong>
          <pre style={{ overflowX: "auto", margin: "10px 0 0" }}>
            <code>{newToken}</code>
          </pre>
        </div>
      )}

      <form action={createApiTokenAction} className="stale-form" style={{ marginTop: 16 }}>
        <input type="text" name="name" placeholder="Token name (e.g. ci-bot)" />
        <button type="submit" className="btn">
          Create token
        </button>
      </form>

      {tokens.length === 0 ? (
        <div className="empty">No tokens yet.</div>
      ) : (
        <div className="panel" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Created</th>
                <th>Last used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "never"}</td>
                  <td style={{ textAlign: "right" }}>
                    <form action={revokeApiTokenAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="link-danger">
                        revoke
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
