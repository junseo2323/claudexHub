import type { ContextCard } from "./types.js";

/** Default age (days) after which a verified card is nudged for re-verification. */
export const DEFAULT_REVERIFY_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since the card was last verified, or null if it never was. */
export function daysSinceVerified(card: ContextCard, now: Date = new Date()): number | null {
  if (!card.lastVerifiedAt) return null;
  const verified = new Date(card.lastVerifiedAt).getTime();
  if (Number.isNaN(verified)) return null;
  return Math.max(0, Math.floor((now.getTime() - verified) / DAY_MS));
}

/**
 * A published card that *was* verified but hasn't been re-checked in a while.
 * Distinct from "never verified" (which the confidence score already reflects).
 */
export function needsReverification(
  card: ContextCard,
  maxDays: number = DEFAULT_REVERIFY_DAYS,
  now: Date = new Date(),
): boolean {
  if (card.status !== "published" || card.verification.length === 0) return false;
  const age = daysSinceVerified(card, now);
  return age != null && age > maxDays;
}
