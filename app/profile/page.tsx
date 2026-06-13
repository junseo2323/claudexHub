import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth";
import { getUserStats } from "../lib/hub";
import { ProfileView } from "../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ProfilePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const stats = getUserStats(me.id);
  if (!stats) redirect("/login");

  return <ProfileView summary={stats.summary} cards={stats.cards} />;
}
