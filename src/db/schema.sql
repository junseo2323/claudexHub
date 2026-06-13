-- AI Agent Context Hub — Phase 1 schema (single source of truth).
-- The vec0 table's dimension placeholder __EMBED_DIM__ is replaced at runtime
-- with the configured embedding dimension (see migrate.ts).

-- Canonical card table. Arrays/objects are stored as JSON text.
CREATE TABLE IF NOT EXISTS context_cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  environment TEXT,            -- JSON { frontend, backend, deploy, browser }
  symptoms TEXT,              -- JSON string[]
  likely_causes TEXT,        -- JSON string[]
  failed_attempts TEXT,      -- JSON string[]
  verified_fix TEXT,         -- JSON string[]
  verification TEXT,         -- JSON string[]
  agent_hint TEXT,
  source_links TEXT,         -- JSON string[]
  visibility TEXT NOT NULL DEFAULT 'private',   -- public | private | team
  status TEXT NOT NULL DEFAULT 'draft',         -- draft | approved | published | stale | deprecated
  confidence_score REAL NOT NULL DEFAULT 0,
  estimated_tokens_saved INTEGER NOT NULL DEFAULT 0,
  successful_reuse_count INTEGER NOT NULL DEFAULT 0,
  failed_reuse_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cards_status ON context_cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_visibility ON context_cards(visibility);

-- Provenance behind a draft (diffs, logs, commit shas, conversation refs).
CREATE TABLE IF NOT EXISTS source_evidence (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES context_cards(id) ON DELETE CASCADE,
  source TEXT NOT NULL,       -- worklog | diff | conversation | manual
  repo TEXT,
  commit_sha TEXT,
  files TEXT,                 -- JSON string[]
  content TEXT,               -- REDACTED raw evidence
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_card ON source_evidence(card_id);

-- Agent reuse feedback: one row per time an agent applies a card.
CREATE TABLE IF NOT EXISTS agent_usage (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES context_cards(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,        -- claude_code | codex | cursor | other
  outcome TEXT NOT NULL,      -- success | partial | failed
  tokens_before_estimate INTEGER,
  tokens_after_actual INTEGER,
  estimated_tokens_saved INTEGER NOT NULL DEFAULT 0,
  stack TEXT,                 -- JSON string[]
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_card ON agent_usage(card_id);

-- Keyword search (contentless FTS5). Kept in sync from app code, not triggers.
CREATE VIRTUAL TABLE IF NOT EXISTS context_cards_fts USING fts5(
  id UNINDEXED,
  title,
  problem,
  symptoms,
  likely_causes,
  verified_fix,
  tokenize = 'unicode61'
);

-- Vector search (sqlite-vec). Dimension injected at runtime.
CREATE VIRTUAL TABLE IF NOT EXISTS context_cards_vec USING vec0(
  card_id TEXT PRIMARY KEY,
  embedding float[__EMBED_DIM__] distance_metric=cosine
);
