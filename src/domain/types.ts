export type Visibility = "public" | "private" | "team";
export type CardStatus = "draft" | "approved" | "published" | "stale" | "deprecated";
export type EvidenceSource = "worklog" | "diff" | "conversation" | "manual";

export interface CardEnvironment {
  frontend?: string;
  backend?: string;
  deploy?: string;
  browser?: string;
  [key: string]: string | undefined;
}

export interface ContextCard {
  id: string;
  title: string;
  problem: string;
  environment: CardEnvironment;
  symptoms: string[];
  likelyCauses: string[];
  failedAttempts: string[];
  verifiedFix: string[];
  verification: string[];
  agentHint: string;
  sourceLinks: string[];
  visibility: Visibility;
  status: CardStatus;
  confidenceScore: number;
  estimatedTokensSaved: number;
  successfulReuseCount: number;
  failedReuseCount: number;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt?: string;
}

export interface SourceEvidence {
  id: string;
  cardId: string;
  source: EvidenceSource;
  repo?: string;
  commitSha?: string;
  files: string[];
  content: string;
  createdAt: string;
}

/** Token-cheap search result. Never contains the full card body. */
export interface CardBrief {
  id: string;
  title: string;
  confidence: number;
  tokens_estimate: number;
  match_reason: string;
  fix_summary: string[];
  risk: "low" | "medium" | "high";
}

export interface SearchInput {
  query: string;
  stack?: string[];
  error?: string;
  files?: string[];
  repo?: string;
  limit?: number;
}
