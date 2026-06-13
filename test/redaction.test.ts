import { describe, it, expect } from "vitest";
import { scan, redact, redactCard } from "../src/domain/redaction.js";

describe("redaction patterns", () => {
  const cases: { name: string; input: string }[] = [
    { name: "aws_access_key", input: "key AKIAIOSFODNN7EXAMPLE here" },
    { name: "jwt", input: "token eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJSMeKKF2QT4" },
    { name: "db_url", input: "DATABASE_URL=postgres://user:pass@db.example.com:5432/app" },
    { name: "bearer", input: "Authorization: Bearer abcdef1234567890token" },
    { name: "github_token", input: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
    { name: "stripe", input: "sk_live_abcdef123456789" },
    { name: "key_value", input: "client_secret: 'supersecretvalue123'" },
    { name: "email", input: "contact me at dev@example.com please" },
    { name: "internal_ip", input: "server at 10.0.0.5 and 192.168.1.1" },
    {
      name: "private_key",
      input: "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----",
    },
  ];

  for (const c of cases) {
    it(`detects and redacts ${c.name}`, () => {
      const findings = scan(c.input);
      expect(findings.length).toBeGreaterThan(0);
      const { redacted } = redact(c.input);
      expect(redacted).toContain("[REDACTED:");
    });
  }

  it("does not flag benign config like NODE_ENV", () => {
    const findings = scan("NODE_ENV=production PORT=3000 LOG_LEVEL=info");
    expect(findings).toHaveLength(0);
  });

  it("never stores the raw secret in a finding", () => {
    const findings = scan("api_key: 'abcdef1234567890'");
    expect(findings[0].preview).not.toContain("abcdefg");
    expect(findings[0].preview).toContain("*");
  });

  it("redacts only the value in key=value, keeping the key", () => {
    const { redacted } = redact("password=hunter2secret");
    expect(redacted).toContain("password=");
    expect(redacted).toContain("[REDACTED:KEY_VALUE_SECRET]");
    expect(redacted).not.toContain("hunter2secret");
  });

  it("redactCard reports across fields", () => {
    const { card, report } = redactCard({
      title: "Issue",
      problem: "DB at postgres://u:p@host/db failed",
      verifiedFix: ["set api_key: 'leaked12345'"],
      environment: { backend: "email admin@example.com" },
    });
    expect(report.findingsCount).toBeGreaterThanOrEqual(3);
    expect(card.problem).toContain("[REDACTED:DB_URL]");
    expect(card.verifiedFix?.[0]).toContain("[REDACTED:");
    expect(card.environment?.backend).toContain("[REDACTED:EMAIL]");
    expect(report.redactedFields).toContain("problem");
  });
});
