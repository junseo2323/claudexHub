import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "../lib/auth";
import { getUserStats } from "../lib/hub";
import { ProfileView } from "../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const stats = getUserStats(me.id);
  if (!stats) redirect("/login");

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginBottom: -8 }}>
        {isAdmin(me) && (
          <Link href="/status" className="subtle">
            Status →
          </Link>
        )}
        <Link href="/settings/tokens" className="subtle">
          API tokens →
        </Link>
      </div>
      <ProfileView summary={stats.summary} cards={stats.cards} />
    </>
  );
}
