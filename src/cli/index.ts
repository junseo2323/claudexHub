import {
  chmodSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Command } from "commander";
import { getDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { Repository } from "../domain/repository.js";
import { SearchService } from "../domain/search.js";
import { cardInputSchema, evidenceSourceSchema } from "../domain/card-schema.js";
import { hubStats } from "../domain/stats.js";
import { evaluateSelfRetrieval } from "../domain/eval.js";
import { seed } from "../seed/seed.js";
import { config } from "../config.js";
import { extractDraft } from "../domain/extraction.js";
import { redact, redactCard, mergeReports, reportFromFindings } from "../domain/redaction.js";
import type { CardInput } from "../domain/card-schema.js";
import {
  CODEX_TOKEN_ENV,
  HOSTED_ORIGIN,
  MCP_SERVER_NAME,
  parseClientSelection,
  registerAntigravityConfig,
  registerCursorConfig,
  type AgentClient,
} from "./agent-connect.js";

function repo(): Repository {
  const db = getDb();
  migrate(db);
  return new Repository(db);
}

const program = new Command();
program
  .name("context-hub")
  .description("CLI for the AI Agent Context Hub")
  .version("0.2.0");

program
  .command("init")
  .description("One-command setup: create the schema and load seed data")
  .option("--no-seed", "Only create the schema (skip seed cards)")
  .action(async (opts: { seed: boolean }) => {
    const db = getDb();
    migrate(db);
    if (opts.seed === false) {
      console.log(`Initialized schema at ${config.dbPath}`);
      return;
    }
    const n = await seed();
    console.log(`Initialized ${config.dbPath} — schema + ${n} seed cards (embeddings=${config.embeddingProvider})`);
  });

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
  .option("--version <version>", "Comma-separated version tokens")
  .option("--error <error>")
  .option("--files <files>", "Comma-separated file paths")
  .option("--repo <repo>")
  .option("--min-confidence <n>", "Drop results below this confidence")
  .option("--limit <n>", "Max results", "5")
  .action(
    async (
      query: string,
      opts: { stack?: string; version?: string; error?: string; files?: string; repo?: string; minConfidence?: string; limit: string },
    ) => {
      migrate(getDb());
      const search = new SearchService(getDb());
      const results = await search.search({
        query,
        stack: opts.stack ? opts.stack.split(",").map((s) => s.trim()) : undefined,
        version: opts.version ? opts.version.split(",").map((s) => s.trim()) : undefined,
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
  .option(
    "--agent <agent>",
    "claude_code|codex|cursor|antigravity|other",
    "claude_code",
  )
  .option("--before <n>", "Estimated tokens without the card")
  .option("--after <n>", "Actual tokens used")
  .action(
    async (
      id: string,
      opts: { outcome: "success" | "partial" | "failed"; agent: string; before?: string; after?: string },
    ) => {
      const { card, usage } = await repo().recordUsage(id, {
        agent: opts.agent as
          | "claude_code"
          | "codex"
          | "cursor"
          | "antigravity"
          | "other",
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
        console.log(
          `  ${a.agent}: ${a.uses} uses, ${pct(a.successRate)} success, ` +
            `${a.successes} ok / ${a.failures} failed, ${a.tokensSaved.toLocaleString()} tokens saved ` +
            `(${a.avgTokensSaved.toLocaleString()} avg/use)`,
        );
      }
    }
  });

program
  .command("eval")
  .description("Search-quality self-retrieval eval (each card title should find its card)")
  .option("--k <n>", "Top-k cutoff", "5")
  .option("--json", "Output raw JSON")
  .action(async (opts: { k: string; json?: boolean }) => {
    const db = getDb();
    migrate(db);
    const search = new SearchService(db);
    const report = await evaluateSelfRetrieval(search, db, Number(opts.k));
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    console.log(`=== Search eval (self-retrieval, k=${report.k}, ${report.cases} cards) ===`);
    console.log(`hit@1:     ${pct(report.hitAt1Rate)}`);
    console.log(`hit@${report.k}:     ${pct(report.hitAtKRate)}`);
    console.log(`MRR:       ${report.mrr.toFixed(3)}`);
    console.log(`precision@${report.k}: ${pct(report.meanPrecisionAtK)}`);
  });

program
  .command("reindex")
  .description("Rebuild FTS + vector indexes from the canonical table")
  .action(async () => {
    const n = await repo().reindexAll();
    console.log(`Reindexed ${n} cards (embeddings=${config.embeddingProvider})`);
  });

/** Where the CLI persists tokens, keyed by hub origin. */
function credentialsPath(): string {
  return path.join(os.homedir(), ".context-hub", "credentials.json");
}

function saveCredential(origin: string, data: { token: string; login?: string }): string {
  const file = credentialsPath();
  mkdirSync(path.dirname(file), { recursive: true });
  let store: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      store = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      store = {};
    }
  }
  store[origin] = { ...data, createdAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

/** Best-effort open of a URL in the default browser; never throws. */
function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* fall back to the printed URL */
  }
}

/** True if a command resolves on PATH (no ENOENT when invoked). */
function commandExists(cmd: string): boolean {
  const r = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return !r.error;
}

function run(cmd: string, args: string[]): { ok: boolean; err: string } {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { ok: r.status === 0, err: (r.stderr || r.stdout || "").trim() };
}

/** Register the hosted MCP endpoint with Claude Code (token inline in a header). */
function registerClaude(mcpUrl: string, token: string): boolean {
  run("claude", ["mcp", "remove", "-s", "user", MCP_SERVER_NAME]); // ignore if absent
  const { ok, err } = run("claude", [
    "mcp", "add", "-s", "user", "-t", "http", MCP_SERVER_NAME, mcpUrl,
    "-H", `Authorization: Bearer ${token}`,
  ]);
  if (ok) console.log(`✅ Registered with Claude Code (user scope) as "${MCP_SERVER_NAME}".`);
  else console.error(`⚠️  Claude registration failed: ${err}`);
  return ok;
}

/**
 * Register with Codex. Codex reads the bearer token from an env var (it does not
 * accept a literal token), so we also persist that env var to the user's shell rc.
 */
function registerCodex(mcpUrl: string, token: string): boolean {
  run("codex", ["mcp", "remove", MCP_SERVER_NAME]); // ignore if absent
  const { ok, err } = run("codex", [
    "mcp", "add", MCP_SERVER_NAME, "--url", mcpUrl,
    "--bearer-token-env-var", CODEX_TOKEN_ENV,
  ]);
  if (!ok) {
    console.error(`⚠️  Codex registration failed: ${err}`);
    return false;
  }
  const rc = persistShellEnv(CODEX_TOKEN_ENV, token);
  console.log(`✅ Registered with Codex as "${MCP_SERVER_NAME}".`);
  if (rc) console.log(`   Wrote ${CODEX_TOKEN_ENV} to ${rc} — restart your shell or run: source ${rc}`);
  else console.log(`   Set the token in your environment: export ${CODEX_TOKEN_ENV}=${token}`);
  return true;
}

function registerCursor(mcpUrl: string, token: string): boolean {
  try {
    const file = registerCursorConfig(mcpUrl, token);
    console.log(`✅ Registered with Cursor in ${file}.`);
    return true;
  } catch (error) {
    console.error(`⚠️  Cursor registration failed: ${String(error)}`);
    return false;
  }
}

function registerAntigravity(mcpUrl: string, token: string): boolean {
  try {
    const file = registerAntigravityConfig(mcpUrl, token);
    console.log(`✅ Registered with Antigravity in ${file}.`);
    return true;
  } catch (error) {
    console.error(`⚠️  Antigravity registration failed: ${String(error)}`);
    return false;
  }
}

/** Idempotently persist `export NAME=value` to the user's shell rc file. */
function persistShellEnv(name: string, value: string): string | null {
  const shell = process.env.SHELL ?? "";
  const rc = shell.includes("zsh")
    ? ".zshrc"
    : shell.includes("bash")
      ? ".bashrc"
      : shell.includes("fish")
        ? null // fish syntax differs; skip auto-write
        : ".profile";
  if (!rc) return null;
  const file = path.join(os.homedir(), rc);
  let lines: string[] = [];
  if (existsSync(file)) {
    lines = readFileSync(file, "utf8").split("\n").filter((l) => !l.startsWith(`export ${name}=`));
  }
  if (lines.length && lines[lines.length - 1] !== "") lines.push("");
  lines.push(`export ${name}=${value}`, "");
  writeFileSync(file, lines.join("\n"));
  return file;
}

interface ConnectOptions {
  host: string;
  name: string;
  client?: string;
  open: boolean;
  print?: boolean;
}

function detectedClients(): AgentClient[] {
  const clients: AgentClient[] = [];
  if (commandExists("claude")) clients.push("claude");
  if (commandExists("codex")) clients.push("codex");
  if (
    commandExists("cursor") ||
    commandExists("cursor-agent") ||
    existsSync(path.join(os.homedir(), ".cursor"))
  ) {
    clients.push("cursor");
  }
  if (
    commandExists("agy") ||
    existsSync(path.join(os.homedir(), ".gemini", "config"))
  ) {
    clients.push("antigravity");
  }
  return clients;
}

async function connectAgent(opts: ConnectOptions): Promise<void> {
  const origin = opts.host.replace(/\/+$/, "");
  const want = (opts.client ?? "auto").toLowerCase();
  const clients = want === "auto" ? detectedClients() : parseClientSelection(want);
  const state = crypto.randomBytes(16).toString("hex");

  const token = await new Promise<{ token: string; login?: string }>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const got = url.searchParams.get("state");
      const tok = url.searchParams.get("token");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (got !== state || !tok) {
        res.statusCode = 400;
        res.end("<p>Invalid login response. You can close this window.</p>");
        return;
      }
      res.end("<p>✅ Logged in to Context Hub. You can close this window.</p>");
      server.close();
      resolve({ token: tok, login: url.searchParams.get("login") ?? undefined });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const loginUrl =
        `${origin}/settings/tokens/cli?port=${port}` +
        `&state=${state}&name=${encodeURIComponent(opts.name)}`;
      console.log(`Opening ${loginUrl}`);
      console.log("If your browser didn't open, visit the URL above to authorize.");
      if (opts.open) openBrowser(loginUrl);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for browser login (5 min)."));
    }, 5 * 60_000).unref();
  });

  if (opts.print) {
    console.log(token.token);
    return;
  }

  const file = saveCredential(origin, token);
  console.log(`\n✅ Token saved to ${file}${token.login ? ` (as ${token.login})` : ""}`);

  const mcpUrl = `${origin}/api/mcp`;

  let registered = false;
  for (const client of clients) {
    if (client === "claude") {
      registered = registerClaude(mcpUrl, token.token) || registered;
    } else if (client === "codex") {
      registered = registerCodex(mcpUrl, token.token) || registered;
    } else if (client === "cursor") {
      registered = registerCursor(mcpUrl, token.token) || registered;
    } else if (client === "antigravity") {
      registered = registerAntigravity(mcpUrl, token.token) || registered;
    }
  }

  if (!registered) {
    console.log("\nNo agent was registered. Re-run with a client name, for example:");
    console.log("  context-hub connect codex");
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            [MCP_SERVER_NAME]: {
              url: mcpUrl,
              headers: { Authorization: `Bearer ${token.token}` },
            },
          },
        },
        null,
        2,
      ),
    );
  }
}

function addConnectOptions(command: Command): Command {
  return command
    .option("--host <url>", "Hub base URL", process.env.HUB_URL || HOSTED_ORIGIN)
    .option("--name <name>", "Token name", `cli@${os.hostname()}`)
    .option("--no-open", "Print the URL instead of opening a browser")
    .option("--print", "Print the token only; don't save or register");
}

addConnectOptions(
  program
    .command("connect [client]")
    .description(
      "Sign in and connect Claude, Codex, Cursor, or Antigravity to the hosted Hub",
    ),
).action(async (client: string | undefined, opts: ConnectOptions) => {
  await connectAgent({ ...opts, client: client ?? "auto" });
});

addConnectOptions(
  program
    .command("login")
    .description("Legacy alias for connect")
    .option(
      "--client <client>",
      "claude | codex | cursor | antigravity | all | none (default: auto)",
    ),
).action(async (opts: ConnectOptions) => {
  await connectAgent(opts);
});

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
