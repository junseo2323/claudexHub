import { readFileSync } from "node:fs";
import { Command } from "commander";
import { getDb } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { Repository } from "../domain/repository.js";
import { SearchService } from "../domain/search.js";
import { cardInputSchema } from "../domain/card-schema.js";
import { config } from "../config.js";

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
  .option("--limit <n>", "Max results", "5")
  .action(async (query: string, opts: { stack?: string; error?: string; limit: string }) => {
    const search = new SearchService(getDb());
    migrate(getDb());
    const results = await search.search({
      query,
      stack: opts.stack ? opts.stack.split(",").map((s) => s.trim()) : undefined,
      error: opts.error,
      limit: Number(opts.limit),
    });
    console.log(JSON.stringify(results, null, 2));
  });

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
