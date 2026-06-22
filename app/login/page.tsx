import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, githubConfigured, devLoginEnabled, safeNext } from "../lib/auth";
import { listDemoUsers } from "../lib/claudexhub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const me = await getCurrentUser();
  const { next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  if (me) redirect(next ?? "/profile");
  const demoUsers = devLoginEnabled ? listDemoUsers() : [];
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  const devQ = (login: string) =>
    next ? `?login=${login}&next=${encodeURIComponent(next)}` : `?login=${login}`;

  return (
    <>
      <h1>Sign in</h1>
      <p className="subtle">Sign in to view your profile, contributions, and reputation.</p>

      <div className="login-options">
        {githubConfigured && (
          <a className="btn" href={`/api/auth/github${q}`}>
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
              <Link className="btn secondary" href={`/api/auth/dev${devQ("alice")}`}>
                Sign in as demo user
              </Link>
            ) : (
              demoUsers.map((u) => (
                <a key={u.id} className="btn secondary" href={`/api/auth/dev${devQ(u.login)}`}>
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
