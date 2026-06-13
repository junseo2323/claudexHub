"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { createDraftForUser, publishDraftForUser } from "./hub";

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function createDraftAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const problem = String(formData.get("problem") ?? "").trim();
  if (!title || !problem) redirect("/new?error=missing");

  const environment: Record<string, string> = {};
  for (const key of ["frontend", "backend", "deploy"] as const) {
    const v = String(formData.get(key) ?? "").trim();
    if (v) environment[key] = v;
  }

  const { card } = await createDraftForUser(user.id, {
    title,
    problem,
    content: String(formData.get("content") ?? "").trim() || undefined,
    environment,
    verifiedFix: lines(formData.get("verifiedFix")),
  });

  redirect(`/drafts/${card.id}`);
}

export async function publishDraftAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cardId = String(formData.get("cardId") ?? "");
  const result = await publishDraftForUser(cardId, user.id);
  if (!result.ok) redirect(`/drafts/${cardId}?error=secrets`);
  redirect(`/cards/${cardId}`);
}
