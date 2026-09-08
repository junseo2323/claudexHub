/** Default cookie-signing secret from app/lib/auth.ts; unsafe in production. */
const INSECURE_AUTH_SECRET = "dev-insecure-secret-change-me";

export interface ConfigWarning {
  level: "warn" | "error";
  message: string;
}

/**
 * Validate runtime configuration for deployment readiness. Returns issues rather
 * than throwing so callers (health endpoint, startup logs) can decide severity.
 * Only enforces production rules when NODE_ENV=production.
 */
export function checkRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];
  if (env.NODE_ENV !== "production") return warnings;

  if (!env.AUTH_SECRET || env.AUTH_SECRET === INSECURE_AUTH_SECRET) {
    warnings.push({
      level: "error",
      message: "AUTH_SECRET is unset or the insecure default — set a strong random value in production.",
    });
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    warnings.push({
      level: "warn",
      message: "GitHub OAuth is not configured — only the local demo login is available.",
    });
  }
  if (env.EMBEDDING_PROVIDER === "noop") {
    warnings.push({
      level: "warn",
      message: "EMBEDDING_PROVIDER=noop yields non-semantic search — use 'local' or 'openai' in production.",
    });
  }
  // Running without an LLM judge is a valid configuration (heuristic review
  // still gates publishing), so only an explicit provider missing its key is
  // flagged — that would make every review call fail at runtime.
  if (env.LLM_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
    warnings.push({ level: "error", message: "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is unset." });
  } else if (env.LLM_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
    warnings.push({ level: "error", message: "LLM_PROVIDER=openai but OPENAI_API_KEY is unset." });
  }
  return warnings;
}
