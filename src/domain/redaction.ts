import type { ContextCard } from "./types.js";

export type RedactionType =
  | "private_key"
  | "jwt"
  | "db_url"
  | "bearer"
  | "provider_token"
  | "aws_access_key"
  | "key_value_secret"
  | "email"
  | "internal_ip";

export interface RedactionFinding {
  type: RedactionType;
  preview: string; // masked preview only — never the full secret
  field?: string;
}

export interface RedactionReport {
  findingsCount: number;
  byType: Partial<Record<RedactionType, number>>;
  redactedFields: string[];
}

interface Pattern {
  type: RedactionType;
  regex: RegExp;
  /** When set, redact only this capture group (e.g. the value of key=value). */
  group?: number;
}

/**
 * Ordered so structured secrets (private keys, JWTs, URLs) are matched before
 * the broad key=value rule, preventing double-masking. Phase 1 favors
 * over-redaction.
 */
export const REDACTION_PATTERNS: Pattern[] = [
  {
    type: "private_key",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END[^-]+-----/g,
  },
  { type: "jwt", regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  {
    type: "db_url",
    regex: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s'"]+/gi,
  },
  { type: "bearer", regex: /\bBearer\s+[A-Za-z0-9._-]{8,}/g },
  {
    type: "provider_token",
    regex: /\b(?:xox[baprs]-[A-Za-z0-9-]+|gh[pousr]_[A-Za-z0-9]{20,}|sk_(?:live|test)_[A-Za-z0-9]+)\b/g,
  },
  { type: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    type: "key_value_secret",
    regex:
      /\b(?:api[_-]?key|client[_-]?secret|secret|access[_-]?token|auth[_-]?token|token|password|passwd|pwd)\b\s*[:=]\s*['"]?([^\s'",;]+)/gi,
    group: 1,
  },
  { type: "email", regex: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  {
    type: "internal_ip",
    regex: /\b(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}\b/g,
  },
];

function maskPreview(secret: string): string {
  const head = secret.slice(0, 4);
  return `${head}${"*".repeat(Math.min(8, Math.max(secret.length - 4, 3)))}`;
}

/** Find (but do not modify) secrets in a string. */
export function scan(text: string, field?: string): RedactionFinding[] {
  const findings: RedactionFinding[] = [];
  for (const { type, regex, group } of REDACTION_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const secret = group != null ? m[group] : m[0];
      if (!secret) continue;
      findings.push({ type, preview: maskPreview(secret), field });
    }
  }
  return findings;
}

/** Replace secrets with `[REDACTED:TYPE]` tokens. */
export function redact(text: string): { redacted: string; findings: RedactionFinding[] } {
  let redacted = text;
  const findings: RedactionFinding[] = [];
  for (const { type, regex, group } of REDACTION_PATTERNS) {
    redacted = redacted.replace(new RegExp(regex.source, regex.flags), (match, ...args) => {
      const captured = group != null ? (args[group - 1] as string | undefined) : match;
      if (!captured) return match;
      findings.push({ type, preview: maskPreview(captured) });
      if (group != null) {
        // Redact only the captured value, keep the surrounding key.
        return match.replace(captured, `[REDACTED:${type.toUpperCase()}]`);
      }
      return `[REDACTED:${type.toUpperCase()}]`;
    });
  }
  return { redacted, findings };
}

/** Aggregate findings into a report (no raw secrets). */
export function reportFromFindings(findings: RedactionFinding[]): RedactionReport {
  const byType: Partial<Record<RedactionType, number>> = {};
  const fields = new Set<string>();
  for (const f of findings) {
    byType[f.type] = (byType[f.type] ?? 0) + 1;
    if (f.field) fields.add(f.field);
  }
  return { findingsCount: findings.length, byType, redactedFields: [...fields] };
}

/** Combine two redaction reports. */
export function mergeReports(a: RedactionReport, b: RedactionReport): RedactionReport {
  const byType: Partial<Record<RedactionType, number>> = { ...a.byType };
  for (const [type, n] of Object.entries(b.byType)) {
    byType[type as RedactionType] = (byType[type as RedactionType] ?? 0) + (n ?? 0);
  }
  return {
    findingsCount: a.findingsCount + b.findingsCount,
    byType,
    redactedFields: [...new Set([...a.redactedFields, ...b.redactedFields])],
  };
}

const STRING_FIELDS = ["title", "problem", "agentHint"] as const;
const ARRAY_FIELDS = [
  "symptoms",
  "likelyCauses",
  "failedAttempts",
  "verifiedFix",
  "verification",
  "sourceLinks",
] as const;

/** Redact every text field of a card and return a report of what was stripped. */
export function redactCard<T extends Partial<ContextCard>>(
  card: T,
): { card: T; report: RedactionReport } {
  const out = { ...card };
  const findings: RedactionFinding[] = [];

  for (const field of STRING_FIELDS) {
    const value = out[field];
    if (typeof value === "string" && value) {
      const { redacted, findings: f } = redact(value);
      (out as Record<string, unknown>)[field] = redacted;
      findings.push(...f.map((x) => ({ ...x, field })));
    }
  }

  for (const field of ARRAY_FIELDS) {
    const value = out[field];
    if (Array.isArray(value)) {
      (out as Record<string, unknown>)[field] = value.map((item) => {
        if (typeof item !== "string") return item;
        const { redacted, findings: f } = redact(item);
        findings.push(...f.map((x) => ({ ...x, field })));
        return redacted;
      });
    }
  }

  if (out.environment && typeof out.environment === "object") {
    const env: Record<string, string | undefined> = { ...out.environment };
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === "string") {
        const { redacted, findings: f } = redact(v);
        env[k] = redacted;
        findings.push(...f.map((x) => ({ ...x, field: `environment.${k}` })));
      }
    }
    out.environment = env;
  }

  return { card: out, report: reportFromFindings(findings) };
}
