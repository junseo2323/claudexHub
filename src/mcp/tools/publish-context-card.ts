import { z } from "zod";
import type { Repository } from "../../domain/repository.js";
import { redactCard } from "../../domain/redaction.js";

export const publishContextCardSchema = {
  id: z.string().describe("Draft card id to publish"),
  approve: z.boolean().describe("Must be true — explicit human approval is required"),
  visibility: z
    .enum(["public", "private", "team"])
    .optional()
    .describe("Visibility on publish (default: private)"),
};

const inputObject = z.object(publishContextCardSchema);

export function makePublishContextCardHandler(repo: Repository) {
  return async (args: z.infer<typeof inputObject>) => {
    if (args.approve !== true) {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: "approval_required" }) },
        ],
        isError: true,
      };
    }

    const card = repo.getCard(args.id);
    if (!card) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "not_found", id: args.id }) }],
        isError: true,
      };
    }

    // Safety net: re-scan for secrets and block publish if any remain.
    const { report } = redactCard(card);
    if (report.findingsCount > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "secrets_detected", redaction_report: report }),
          },
        ],
        isError: true,
      };
    }

    const updated = await repo.updateCard(args.id, {
      status: "published",
      visibility: args.visibility ?? card.visibility,
      lastVerifiedAt: card.verification.length > 0 ? new Date().toISOString() : card.lastVerifiedAt,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            id: updated.id,
            status: updated.status,
            visibility: updated.visibility,
            redaction_report: report,
          }),
        },
      ],
    };
  };
}
