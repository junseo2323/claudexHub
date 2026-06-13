import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, githubConfigured, devLoginEnabled } from "../lib/auth";
import { listDemoUsers } from "../lib/hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LoginPage() {
  const me = await getCurrentUser();
  if (me) redirect("/profile");
  const demoUsers = devLoginEnabled ? listDemoUsers() : [];

  return (
    <>
      <h1>Sign in</h1>
      <p className="subtle">Sign in to view your profile, contributions, and reputation.</p>

      <div className="login-options">
        {githubConfigured && (
          <a className="btn" href="/api/auth/github">
            Continue with GitHub
          </a>
        )}

        {devLoginEnabled && (
          <>
            {githubConfigured && <div className="subtle">or use a demo account</div>}
            {!githubConfigured && (
              <p className="subtle">
                GitHub OAuth isn’t configured (set <code>GITHUB_CLIENT_ID</code> /{" "}
                <code>GITHUB_CLIENT_SECRET</code>). Demo login is available meanwhile:
              </p>
            )}
            {demoUsers.length === 0 ? (
              <Link className="btn secondary" href="/api/auth/dev?login=alice">
                Sign in as demo user
              </Link>
            ) : (
              demoUsers.map((u) => (
                <a key={u.id} className="btn secondary" href={`/api/auth/dev?login=${u.login}`}>
                  Sign in as {u.name ?? u.login}
                </a>
              ))
            )}
          </>
        )}
      </div>
    </>
  );
}
