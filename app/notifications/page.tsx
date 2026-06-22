import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth";
import { getNotifications, markNotificationsRead } from "../lib/claudexhub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NotificationsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const items = getNotifications(me.id);
  // Mark everything read now that the user is viewing the list.
  markNotificationsRead(me.id);

  return (
    <>
      <h1>Notifications</h1>
      {items.length === 0 ? (
        <div className="empty">No notifications yet.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "18px 0 0" }}>
          {items.map((n) => (
            <li key={n.id} className={`notif-row${n.read ? "" : " unread"}`}>
              <span className="chip">{n.type}</span>
              {n.cardId ? <Link href={`/cards/${n.cardId}`}>{n.message}</Link> : <span>{n.message}</span>}
              <span className="subtle" style={{ marginLeft: "auto", fontSize: 12, whiteSpace: "nowrap" }}>
                {new Date(n.createdAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
