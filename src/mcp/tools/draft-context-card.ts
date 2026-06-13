import { z } from "zod";
import type { Repository } from "../../domain/repository.js";
import { redactCard, redact, mergeReports, reportFromFindings } from "../../domain/redaction.js";
import { buildBrief } from "../../domain/brief.js";
import { extractDraft } from "../../domain/extraction.js";
import type { CardInput } from "../../domain/card-schema.js";

export const draftContextCardSchema = {
  source: z
    .enum(["worklog", "diff", "conversation", "manual", "commit", "pr", "issue", "test", "official_doc"])
    .describe("Where the evidence comes from"),
  repo: z.string().optional(),
  files: z.array(z.string()).optional(),
  commit_sha: z.string().optional(),
  source_links: z.array(z.string()).optional().describe("Source URLs such as commits, PRs, issues, docs, or CI logs"),
  problem_summary: z.string().optional().describe("Short description of the problem"),
  title: z.string().optional().describe("Card title; derived from problem_summary if omitted"),
  content: z.string().optional().describe("Raw evidence: diff, logs, or conversation excerpt"),
  symptoms: z.array(z.string()).optional(),
  likely_causes: z.array(z.string()).optional(),
  verified_fix: z.array(z.string()).optional(),
  verification: z.array(z.string()).optional(),
  agent_hint: z.string().optional(),
  environment: z.record(z.string()).optional(),
};

const inputObject = z.object(draftContextCardSchema);

export function makeDraftContextCardHandler(repo: Repository) {
  return async (args: z.infer<typeof inputObject>) => {
    const problem = args.problem_summary ?? args.content ?? "";
    if (!problem) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "problem_summary or content required" }),
          },
        ],
        isError: true,
      };
    }

    // Phase 1: deterministic heuristic extraction — no LLM. Explicit args always
    // win over inferred values; the human edits the rest before publishing.
    const extracted = extractDraft({
      problemSummary: args.problem_summary,
      content: args.content,
      environment: args.environment,
      repo: args.repo,
      commitSha: args.commit_sha,
    });
    const sourceLinks = [...new Set([...(args.source_links ?? []), ...extracted.sourceLinks])];

    const rawInput: CardInput = {
      title: args.title ?? extracted.title,
      problem,
      environment: extracted.environment,
      symptoms: args.symptoms ?? extracted.symptoms,
      likelyCauses: args.likely_causes ?? extracted.likelyCauses,
      failedAttempts: extracted.failedAttempts,
      verifiedFix: args.verified_fix ?? extracted.verifiedFix,
      verification: args.verification ?? [],
      agentHint: args.agent_hint ?? "",
      sourceLinks,
      visibility: "private",
      status: "draft",
    };

    // Redact card fields before storing anything.
    const { card: redactedInput, report: cardReport } = redactCard(rawInput);
    const created = await repo.createCard(redactedInput as CardInput);

    // Store the (redacted) raw evidence for provenance, and fold its findings
    // into the report so the human reviewer sees everything that was stripped.
    let report = cardReport;
    if (args.content) {
      const { redacted, findings } = redact(args.content);
      report = mergeReports(cardReport, reportFromFindings(findings.map((f) => ({ ...f, field: "evidence" }))));
      repo.addEvidence(created.id, {
        source: args.source,
        repo: args.repo,
        commitSha: args.commit_sha ?? extracted.report.commitSha,
        url: sourceLinks[0],
        files: args.files,
        content: redacted,
      });
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            id: created.id,
            status: created.status,
            redaction_report: report,
            extraction_report: extracted.report,
            card_brief: buildBrief(created, created.confidenceScore),
          }),
        },
      ],
    };
  };
}
