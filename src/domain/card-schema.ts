import { z } from "zod";

export const visibilitySchema = z.enum(["public", "private", "team"]);
export const cardStatusSchema = z.enum([
  "draft",
  "approved",
  "published",
  "stale",
  "deprecated",
]);
export const evidenceSourceSchema = z.enum(["worklog", "diff", "conversation", "manual"]);

export const environmentSchema = z
  .object({
    frontend: z.string().optional(),
    backend: z.string().optional(),
    deploy: z.string().optional(),
    browser: z.string().optional(),
  })
  .catchall(z.string())
  .default({});

/** Fields a human or agent may supply when creating/drafting a card. */
export const cardInputSchema = z.object({
  title: z.string().min(1),
  problem: z.string().min(1),
  environment: environmentSchema.optional(),
  symptoms: z.array(z.string()).default([]),
  likelyCauses: z.array(z.string()).default([]),
  failedAttempts: z.array(z.string()).default([]),
  verifiedFix: z.array(z.string()).default([]),
  verification: z.array(z.string()).default([]),
  agentHint: z.string().default(""),
  sourceLinks: z.array(z.string()).default([]),
  visibility: visibilitySchema.default("private"),
  status: cardStatusSchema.default("draft"),
});

export type CardInput = z.infer<typeof cardInputSchema>;
