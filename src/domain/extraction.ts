export interface DraftExtractionInput {
  problemSummary?: string;
  content?: string;
  environment?: Record<string, string>;
}

export interface ExtractionReport {
  /** Card field names that were auto-populated from heuristics. */
  inferredFields: string[];
  detectedStacks: string[];
  detectedErrors: string[];
  commitSha?: string;
}

export interface ExtractedDraft {
  title: string;
  problem: string;
  environment: Record<string, string>;
  symptoms: string[];
  likelyCauses: string[];
  failedAttempts: string[];
  verifiedFix: string[];
  report: ExtractionReport;
}

type StackCategory = "frontend" | "backend" | "deploy" | "tool";

interface StackRule {
  pattern: RegExp;
  category: StackCategory;
  label: string;
}

/** Tech keywords mapped to a card environment slot. Niche-first (spec 14.2). */
const STACK_RULES: StackRule[] = [
  { pattern: /\bnext\.?js\b/i, category: "frontend", label: "Next.js" },
  { pattern: /\bvite\b/i, category: "frontend", label: "Vite" },
  { pattern: /\breact\b/i, category: "frontend", label: "React" },
  { pattern: /\bnest\.?js\b/i, category: "backend", label: "NestJS" },
  { pattern: /\bspring( boot)?\b/i, category: "backend", label: "Spring Boot" },
  { pattern: /\bexpress\b/i, category: "backend", label: "Express" },
  { pattern: /\bfastapi\b/i, category: "backend", label: "FastAPI" },
  { pattern: /\bcloudfront\b/i, category: "deploy", label: "CloudFront" },
  { pattern: /\bs3\b/i, category: "deploy", label: "S3" },
  { pattern: /\bnginx\b/i, category: "deploy", label: "Nginx" },
  { pattern: /\bec2\b/i, category: "deploy", label: "EC2" },
  { pattern: /\bvercel\b/i, category: "deploy", label: "Vercel" },
  { pattern: /\bdocker\b/i, category: "deploy", label: "Docker" },
  { pattern: /\bgithub actions\b/i, category: "tool", label: "GitHub Actions" },
  { pattern: /\bprisma\b/i, category: "tool", label: "Prisma" },
  { pattern: /\bpostgres(ql)?\b/i, category: "backend", label: "PostgreSQL" },
  { pattern: /\bredis\b/i, category: "backend", label: "Redis" },
  { pattern: /\bkakao\b/i, category: "tool", label: "Kakao Login" },
  { pattern: /\bnaver\b/i, category: "tool", label: "Naver Login" },
];

/** Patterns that indicate a symptom/error line worth capturing. */
const ERROR_SIGNALS =
  /\b(error|exception|failed|failure|cannot|can't|refused|denied|unauthorized|forbidden|timeout|timed out|mismatch|invalid|undefined|not found|ECONNREFUSED|CORS|KOE\d+|\b[45]\d\d\b)\b/i;

const FIX_MARKER = /^\s*(?:fix|fixed|solution|resolved|solved|works now|the fix)\s*[:\-]/i;
const ATTEMPT_MARKER = /^\s*(?:tried|attempted|i tried|first i tried|we tried)\b/i;
/** Phrases that introduce a root-cause explanation. */
const CAUSE_MARKER =
  /\b(?:because|caused by|due to|root cause|the (?:real )?(?:problem|issue|cause) (?:is|was)|turns out|it was)\b/i;

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function dedupeCap(items: string[], cap: number): string[] {
  return [...new Set(items)].slice(0, cap);
}

function detectStacks(text: string): { environment: Record<string, string>; labels: string[] } {
  const environment: Record<string, string> = {};
  const labels: string[] = [];
  const seen = new Map<StackCategory, string[]>();
  for (const rule of STACK_RULES) {
    if (rule.pattern.test(text)) {
      labels.push(rule.label);
      const arr = seen.get(rule.category) ?? [];
      arr.push(rule.label);
      seen.set(rule.category, arr);
    }
  }
  for (const [category, vals] of seen) {
    if (category === "tool") continue; // tools aren't an env slot; kept in labels
    environment[category] = dedupeCap(vals, 3).join(" / ");
  }
  return { environment, labels: dedupeCap(labels, 8) };
}

function firstSentence(text: string, max = 100): string {
  const line = lines(text)[0] ?? text;
  const stripped = line.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "");
  return stripped.length > max ? stripped.slice(0, max - 1) + "…" : stripped;
}

/**
 * Heuristically extract card fields from a problem summary and/or raw evidence
 * (diff, logs, conversation). No LLM — deterministic pattern matching. Explicit
 * fields provided by the caller should override these inferences.
 */
export function extractDraft(input: DraftExtractionInput): ExtractedDraft {
  const content = input.content ?? "";
  const problem = input.problemSummary || firstSentence(content) || "Untitled problem";
  const inferred: string[] = [];

  // Title.
  const title = input.problemSummary ? firstSentence(input.problemSummary) : firstSentence(content);

  // Environment / stacks.
  const haystack = `${input.problemSummary ?? ""}\n${content}`;
  const { environment: detectedEnv, labels: detectedStacks } = detectStacks(haystack);
  const environment: Record<string, string> = { ...detectedEnv, ...(input.environment ?? {}) };
  if (Object.keys(detectedEnv).length && !input.environment) inferred.push("environment");

  // Symptoms: error-like lines from the content.
  const contentLines = lines(content);
  const symptoms = dedupeCap(
    contentLines
      .filter((l) => ERROR_SIGNALS.test(l) && !FIX_MARKER.test(l) && !CAUSE_MARKER.test(l))
      .map((l) => l.slice(0, 200)),
    5,
  );
  if (symptoms.length) inferred.push("symptoms");

  // Likely causes: lines that explain the root cause. Exclude fix/attempt lines
  // so a single line isn't double-classified.
  const likelyCauses = dedupeCap(
    contentLines
      .filter((l) => CAUSE_MARKER.test(l) && !FIX_MARKER.test(l) && !ATTEMPT_MARKER.test(l))
      .map((l) => l.slice(0, 200)),
    5,
  );
  if (likelyCauses.length) inferred.push("likelyCauses");

  // Failed attempts.
  const failedAttempts = dedupeCap(
    contentLines.filter((l) => ATTEMPT_MARKER.test(l)).map((l) => l.replace(ATTEMPT_MARKER, "").trim() || l),
    5,
  );
  if (failedAttempts.length) inferred.push("failedAttempts");

  // Verified fix: lines marked as the fix/solution.
  const verifiedFix = dedupeCap(
    contentLines.filter((l) => FIX_MARKER.test(l)).map((l) => l.replace(FIX_MARKER, "").trim() || l),
    5,
  );
  if (verifiedFix.length) inferred.push("verifiedFix");

  // Commit sha near the word "commit".
  const commitMatch = content.match(/commit[:\s]+([0-9a-f]{7,40})\b/i);
  const commitSha = commitMatch?.[1];

  const detectedErrors = symptoms.slice(0, 3);

  return {
    title,
    problem,
    environment,
    symptoms,
    likelyCauses,
    failedAttempts,
    verifiedFix,
    report: { inferredFields: dedupeCap(inferred, 10), detectedStacks, detectedErrors, commitSha },
  };
}
