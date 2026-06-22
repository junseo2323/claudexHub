import { getStats } from "./lib/claudexhub";
import { DocsLanding } from "./landing-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function DocsHome() {
  const stats = getStats();
  return <DocsLanding cardsPublished={stats.cardsPublished} />;
}
