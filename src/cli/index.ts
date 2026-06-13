import { readFileSync } from "node:fs";
import { Command } from "commander";
import { getDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { Repository } from "../domain/repository.js";
import { SearchService } from "../domain/search.js";
import { cardInputSchema, evidenceSourceSchema } from "../domain/card-schema.js";
import { hubStats } from "../domain/stats.js";
import { config } from "../config.js";
import { extractDraft } from "../domain/extraction.js";
import { redact, redactCard, mergeReports, reportFromFindings } from "../domain/redaction.js";
import type { CardInput } from "../domain/card-schema.js";

function repo(): Repository {
  const db = getDb();
  migrate(db);
  return new Repository(db);
}

const program = new Command();
program.name("context-hub").description("Dev CLI for the AI Agent Context Hub").version("0.1.0");

program
  .command("create")
  .description("Create a card from a JSON file (CardInput shape)")
  .requiredOption("--json <path>", "Path to a JSON file with card fields")
  .action(async (opts: { json: string }) => {
    const input = cardInputSchema.parse(JSON.parse(readFileSync(opts.json, "utf8")));
    const card = await repo().createCard(input);
    console.log(JSON.stringify(card, null, 2));
  });

program
  .command("draft")
  .description("Create a redacted draft from a local Claude/Codex log, diff, or worklog file")
  .requiredOption("--file <path>", "Path to the log/diff/worklog file")
  .requiredOption("--problem <summary>", "Short problem summary")
  .option("--source <source>", "worklog|diff|conversation|manual|commit|pr|issue|test|official_doc", "conversation")
  .option("--title <title>", "Card title; derived from --problem when omitted")
  .option("--repo <repo>", "GitHub repo slug or URL; enables PR/issue/commit link inference")
  .option("--commit <sha>", "Commit sha to attach as source evidence")
  .option("--files <files>", "Comma-separated related file paths")
  .option("--fix <items>", "Pipe-separated verified fix bullets")
  .option("--source-links <urls>", "Comma-separated source URLs to attach")
  .option("--json", "Output raw JSON")
  .action(
    async (opts: {
      file: string;
      problem: string;
      source: string;
      title?: string;
      repo?: string;
      commit?: string;
      files?: string;
      fix?: string;
      sourceLinks?: string;
      json?: boolean;
    }) => {
      const source = evidenceSourceSchema.parse(opts.source);
      const content = readFileSync(opts.file, "utf8");
      const files = opts.files?.split(",").map((f) => f.trim()).filter(Boolean);
      const explicitLinks = opts.sourceLinks?.split(",").map((l) => l.trim()).filter(Boolean) ?? [];
      const extracted = extractDraft({
        problemSummary: opts.problem,
        content,
        repo: opts.repo,
        commitSha: opts.commit,
      });
      const sourceLinks = [...new Set([...explicitLinks, ...extracted.sourceLinks])];
      const rawInput: CardInput = cardInputSchema.parse({
        title: opts.title ?? extracted.title,
        problem: opts.problem,
        environment: extracted.environment,
        symptoms: extracted.symptoms,
        likelyCauses: extracted.likelyCauses,
        failedAttempts: extracted.failedAttempts,
        verifiedFix: opts.fix?.split("|").map((f) => f.trim()).filter(Boolean) ?? extracted.verifiedFix,
        verification: [],
        agentHint: "",
        sourceLinks,
        visibility: "private",
        status: "draft",
      });
      const { card: redactedInput, report: cardReport } = redactCard(rawInput);
      const r = repo();
      const created = await r.createCard(redactedInput as CardInput);
      const { redacted, findings } = redact(content);
      const evidenceReport = reportFromFindings(findings.map((f) => ({ ...f, field: "evidence" })));
      r.addEvidence(created.id, {
        source,
        repo: opts.repo,
        commitSha: opts.commit ?? extracted.report.commitSha,
        url: sourceLinks[0],
        files,
        content: redacted,
      });
      const output = {
        id: created.id,
        status: created.status,
        source_links: created.sourceLinks,
        redaction_report: mergeReports(cardReport, evidenceReport),
        extraction_report: extracted.report,
      };
      if (opts.json) {
        console.log(JSON.stringify(output, null, 2));
        return;
      }
      console.log(`Drafted ${created.id} (${created.status})`);
      if (created.sourceLinks.length) console.log(`Sources: ${created.sourceLinks.join(", ")}`);
      console.log(`Redactions: ${output.redaction_report.findingsCount}`);
    },
  );

program
  .command("list")
  .description("List cards")
  .option("--status <status>")
  .option("--drafts", "Include drafts")
  .action((opts: { status?: string; drafts?: boolean }) => {
    const cards = repo().listCards({ status: opts.status, includeDrafts: opts.drafts });
    for (const c of cards) {
      console.log(`${c.id}\t[${c.status}/${c.visibility}]\tconf=${c.confidenceScore}\t${c.title}`);
    }
  });

program
  .command("get <id>")
  .description("Get a card by id")
  .option("--mode <mode>", "brief|full|agent_json", "full")
  .action((id: string, opts: { mode: string }) => {
    const card = repo().getCard(id);
    if (!card) {
      console.error("Not found:", id);
      process.exit(1);
    }
    console.log(JSON.stringify(opts.mode === "full" ? card : card, null, 2));
  });

program
  .command("search <query>")
  .description("Hybrid search")
  .option("--stack <stack>", "Comma-separated stack")
  .option("--error <error>")
  .option("--files <files>", "Comma-separated file paths")
  .option("--repo <repo>")
  .option("--min-confidence <n>", "Drop results below this confidence")
  .option("--limit <n>", "Max results", "5")
  .action(
    async (
      query: string,
      opts: { stack?: string; error?: string; files?: string; repo?: string; minConfidence?: string; limit: string },
    ) => {
      migrate(getDb());
      const search = new SearchService(getDb());
      const results = await search.search({
        query,
        stack: opts.stack ? opts.stack.split(",").map((s) => s.trim()) : undefined,
        error: opts.error,
        files: opts.files ? opts.files.split(",").map((s) => s.trim()) : undefined,
        repo: opts.repo,
        minConfidence: opts.minConfidence ? Number(opts.minConfidence) : undefined,
        limit: Number(opts.limit),
      });
      console.log(JSON.stringify(results, null, 2));
    },
  );

program
  .command("publish <id>")
  .description("Publish a card")
  .option("--visibility <v>", "public|private|team", "public")
  .action(async (id: string, opts: { visibility: "public" | "private" | "team" }) => {
    const card = await repo().updateCard(id, { status: "published", visibility: opts.visibility });
    console.log(`Published ${card.id} (${card.visibility})`);
  });

program
  .command("delete <id>")
  .description("Delete a card")
  .action((id: string) => {
    repo().deleteCard(id);
    console.log("Deleted", id);
  });

program
  .command("feedback <id>")
  .description("Record agent reuse feedback for a card")
  .requiredOption("--outcome <outcome>", "success|partial|failed")
  .option("--agent <agent>", "claude_code|codex|cursor|other", "claude_code")
  .option("--before <n>", "Estimated tokens without the card")
  .option("--after <n>", "Actual tokens used")
  .action(
    async (
      id: string,
      opts: { outcome: "success" | "partial" | "failed"; agent: string; before?: string; after?: string },
    ) => {
      const { card, usage } = await repo().recordUsage(id, {
        agent: opts.agent as "claude_code" | "codex" | "cursor" | "other",
        outcome: opts.outcome,
        tokensBeforeEstimate: opts.before ? Number(opts.before) : undefined,
        tokensAfterActual: opts.after ? Number(opts.after) : undefined,
      });
      console.log(
        `Recorded ${usage.outcome} (+${usage.estimatedTokensSaved} tokens saved). ` +
          `confidence=${card.confidenceScore} reuse=${card.successfulReuseCount}/${card.failedReuseCount}`,
      );
    },
  );

program
  .command("stale <id>")
  .description("Mark a card stale")
  .requiredOption("--reason <reason>")
  .option("--versions <versions>", "Comma-separated affected versions")
  .action(async (id: string, opts: { reason: string; versions?: string }) => {
    const card = await repo().markStale(
      id,
      opts.reason,
      opts.versions ? opts.versions.split(",").map((v) => v.trim()) : undefined,
    );
    console.log(`Marked ${card.id} as ${card.status}`);
  });

program
  .command("stats")
  .description("Show hub trust + reuse statistics")
  .option("--json", "Output raw JSON")
  .action((opts: { json?: boolean }) => {
    const db = getDb();
    migrate(db);
    const s = hubStats(db);
    if (opts.json) {
      console.log(JSON.stringify(s, null, 2));
      return;
    }
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    console.log("=== AI Agent Context Hub — Stats ===");
    console.log(`Cards: ${s.cardsTotal} total · ${s.cardsPublished} published · ${s.cardsDraft} draft · ${s.cardsStale} stale`);
    console.log(`Verified fixes: ${s.verifiedFixCount}`);
    console.log(`Reuse: ${s.successfulReuseCount} ok / ${s.failedReuseCount} failed (${pct(s.reuseSuccessRate)} success)`);
    console.log(`Tokens saved (realized): ${s.totalEstimatedTokensSaved.toLocaleString()}`);
    console.log(`Commit-linked: ${pct(s.commitLinkedRatio)} · Evidence-linked: ${pct(s.evidenceLinkedRatio)} · Stale ratio: ${pct(s.staleCardRatio)}`);
    console.log(`Reputation score: ${s.reputationScore}`);
    if (s.topStacks.length) {
      console.log("Top stacks: " + s.topStacks.map((t) => `${t.stack}(${t.count})`).join(", "));
    }
    if (s.agentBreakdown.length) {
      console.log("Agents:");
      for (const a of s.agentBreakdown) {
        console.log(`  ${a.agent}: ${a.uses} uses, ${a.successes} ok / ${a.failures} failed, ${a.tokensSaved.toLocaleString()} tokens saved`);
      }
    }
  });

program
  .command("reindex")
  .description("Rebuild FTS + vector indexes from the canonical table")
  .action(async () => {
    const n = await repo().reindexAll();
    console.log(`Reindexed ${n} cards (embeddings=${config.embeddingProvider})`);
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
