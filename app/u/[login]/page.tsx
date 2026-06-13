import { notFound } from "next/navigation";
import { getUserByLogin, getUserStats } from "../../lib/hub";
import { ProfileView } from "../../components";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PublicProfile({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  const user = getUserByLogin(login);
  if (!user) notFound();
  const stats = getUserStats(user.id);
  if (!stats) notFound();

  return <ProfileView summary={stats.summary} cards={stats.cards} />;
}
