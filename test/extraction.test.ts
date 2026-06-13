import { describe, it, expect } from "vitest";
import { extractDraft } from "../src/domain/extraction.js";

describe("extractDraft", () => {
  it("detects stacks and maps them to environment slots", () => {
    const d = extractDraft({
      problemSummary: "Kakao login fails in prod",
      content: "Frontend is Next.js 15, backend NestJS, deployed on CloudFront + S3.",
    });
    expect(d.environment.frontend).toContain("Next.js");
    expect(d.environment.backend).toContain("NestJS");
    expect(d.environment.deploy).toMatch(/CloudFront|S3/);
    expect(d.report.detectedStacks).toContain("Kakao Login");
    expect(d.report.inferredFields).toContain("environment");
  });

  it("extracts error-like lines as symptoms", () => {
    const d = extractDraft({
      problemSummary: "cookie issue",
      content: [
        "Set-Cookie is present in the response",
        "GET /me returns 401 Unauthorized",
        "CORS error: credentials flag with wildcard origin",
        "just a normal note line",
      ].join("\n"),
    });
    expect(d.symptoms.some((s) => /401/.test(s))).toBe(true);
    expect(d.symptoms.some((s) => /CORS/.test(s))).toBe(true);
    expect(d.symptoms).not.toContain("just a normal note line");
    expect(d.report.inferredFields).toContain("symptoms");
  });

  it("captures failed attempts and the fix", () => {
    const d = extractDraft({
      problemSummary: "deploy broke",
      content: [
        "Tried clearing the CloudFront cache manually",
        "attempted to widen CORS to *",
        "Fix: set SameSite=None; Secure on the cookie",
      ].join("\n"),
    });
    expect(d.failedAttempts.length).toBeGreaterThanOrEqual(2);
    expect(d.verifiedFix.some((f) => /SameSite/.test(f))).toBe(true);
  });

  it("captures likely causes and keeps them out of symptoms", () => {
    const d = extractDraft({
      problemSummary: "auth fails",
      content: [
        "GET /me returns 401 Unauthorized",
        "Root cause: the cookie was set with SameSite=Lax on a cross-site request",
        "because the API is on a different subdomain",
      ].join("\n"),
    });
    expect(d.likelyCauses.length).toBeGreaterThanOrEqual(2);
    expect(d.likelyCauses.some((c) => /SameSite=Lax/.test(c))).toBe(true);
    // The cause line must not also appear as a symptom.
    expect(d.symptoms.some((s) => /Root cause/.test(s))).toBe(false);
    expect(d.report.inferredFields).toContain("likelyCauses");
  });

  it("finds a commit sha near the word commit", () => {
    const d = extractDraft({ content: "Resolved in commit a1b2c3d4e5 on main" });
    expect(d.report.commitSha).toBe("a1b2c3d4e5");
  });

  it("derives a title and falls back gracefully with no content", () => {
    const d = extractDraft({ problemSummary: "OAuth callback redirect loop in production" });
    expect(d.title.length).toBeGreaterThan(0);
    expect(d.problem).toContain("OAuth");
    expect(d.symptoms).toHaveLength(0);
  });
});
