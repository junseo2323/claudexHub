import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth";
import { createDraftAction } from "../lib/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NewCardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { error } = await searchParams;

  return (
    <>
      <h1>New context card</h1>
      <p className="subtle">
        Draft a solved problem. Secrets are redacted automatically; you review and publish.
      </p>
      {error === "missing" && <div className="banner">Title and problem are required.</div>}

      <form action={createDraftAction} className="cardform">
        <label>
          Title
          <input type="text" name="title" required placeholder="e.g. Kakao login redirect_uri mismatch" />
        </label>
        <label>
          Problem
          <textarea name="problem" required rows={3} placeholder="What went wrong, briefly." />
        </label>

        <div className="form-grid">
          <label>
            Frontend
            <input type="text" name="frontend" placeholder="Next.js 15" />
          </label>
          <label>
            Backend
            <input type="text" name="backend" placeholder="NestJS" />
          </label>
          <label>
            Deploy
            <input type="text" name="deploy" placeholder="CloudFront + S3" />
          </label>
        </div>

        <label>
          Verified fix (one per line)
          <textarea name="verifiedFix" rows={3} placeholder="The change that resolved it." />
        </label>
        <label>
          Evidence (optional — logs / diff / notes; symptoms, causes & commit are auto-extracted)
          <textarea name="content" rows={5} placeholder="Paste raw logs or a diff…" />
        </label>

        <div>
          <button type="submit" className="btn">
            Create draft
          </button>
        </div>
      </form>
    </>
  );
}
