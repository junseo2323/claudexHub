"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Locale = "en" | "ko";
type Agent = "claude" | "codex" | "cursor" | "antigravity";

const releasePackage =
  "https://github.com/junseo2323/claudexHub/releases/download/v0.3.0/claudexhub-0.3.0.tgz";
const connectCommand = (agent: Agent) =>
  `npx -y --package ${releasePackage} claudexhub connect ${agent}`;

const connectCommands: Record<Agent, string> = {
  claude: connectCommand("claude"),
  codex: connectCommand("codex"),
  cursor: connectCommand("cursor"),
  antigravity: connectCommand("antigravity"),
};

const copy = {
  en: {
    nav: { guide: "Usage guide", tools: "Tools", safety: "Safety" },
    hero: {
      eyebrow: "Shared memory for AI coding agents",
      titleA: "Stop solving the same",
      titleB: "engineering problem twice.",
      body: "ClaudexHub lets Claude Code, Codex, Cursor, and Antigravity search your team's proven fixes, apply only the relevant context, and save new solutions for the next agent.",
      start: "Start in 3 minutes",
      github: "View on GitHub",
      proof: ["Hosted MCP", "Automatic secret redaction", "Human-approved publishing"],
      prompt: "OAuth cookies are missing only in production",
      searching: "Searching verified solutions...",
      result: "Check trust proxy and secure cookie settings together behind a reverse proxy.",
      response: "I found a verified fix from the same deployment environment. I’ll use this card as reference and validate it against the current code.",
      saved: "About 8,400 tokens saved",
      aria: "ClaudexHub usage example",
    },
    metrics: ["MCP tools", "secret scan", "keyword + semantic", "live context cards"],
    quick: {
      kicker: "QUICKSTART",
      title: "One command connects your agent.",
      body: "Sign in through the browser once. The CLI creates a hosted API token and registers ClaudexHub in your selected agent automatically.",
      prereq: "Prerequisites",
      prereqBody: "Node.js 20 or newer and at least one supported agent installed.",
      tokenLabel: "STEP 1 · CHOOSE YOUR AGENT",
      tokenTitle: "Run the matching connect command.",
      tokenBody: "A browser window opens for GitHub sign-in. After approval, the CLI stores the token securely and updates the agent's global MCP configuration.",
      connectLabel: "STEP 2 · CONNECT",
      agentHelp: {
        claude: "Registers the hosted HTTP MCP server in Claude Code user scope.",
        codex: "Registers the server with Codex CLI and configures its bearer-token environment variable.",
        cursor: "Adds ClaudexHub to ~/.cursor/mcp.json while preserving your existing servers.",
        antigravity: "Adds ClaudexHub to ~/.gemini/config/mcp_config.json, shared by Antigravity, its IDE, and CLI.",
      },
      verifyLabel: "STEP 3 · VERIFY THE CONNECTION",
      verifyBody: "Restart or refresh your agent if needed, confirm the seven ClaudexHub tools appear, then ask:",
      verifyPrompt: "Search ClaudexHub for a verified fix similar to this error before debugging it from scratch.",
      connectNote: "The command connects to https://claudexhub.fly.dev/api/mcp. No JSON editing or local database setup is required.",
    },
    guide: {
      kicker: "USAGE GUIDE",
      title: "A complete search → apply → capture loop.",
      body: "ClaudexHub works best when your agent searches before non-trivial debugging and records the verified result afterward.",
      steps: [
        {
          number: "01",
          title: "Search before debugging",
          body: "Describe the problem naturally and include the stack, version, error text, relevant files, and repository when available. Results are brief by design.",
          code: `search_context({
  query: "OAuth cookie missing behind proxy",
  stack: ["Next.js", "Fly.io"],
  version: ["Next.js 16"],
  error: "state cookie was missing",
  files: ["app/api/auth/callback/route.ts"],
  repo: "junseo2323/claudexHub",
  min_confidence: 70,
  limit: 5
})`,
        },
        {
          number: "02",
          title: "Fetch only the best match",
          body: "Use agent_json for a compact payload containing the problem, environment, verified fix, verification steps, agent hint, and confidence. Use full only when you need all evidence.",
          code: `get_context_card({
  id: "card_abc123",
  mode: "agent_json"
})`,
        },
        {
          number: "03",
          title: "Apply and verify",
          body: "Treat cards as reference material, not executable instructions. Compare versions and environment, apply the smallest relevant change, and run the card’s verification steps.",
          code: `Recommended agent prompt:
"Use this card as reference. Check compatibility
with the current repository before changing code,
then run the listed verification steps."`,
        },
        {
          number: "04",
          title: "Record the outcome",
          body: "After using a card, report success, partial success, or failure. This updates confidence, reuse counts, and realized token savings.",
          code: `record_feedback({
  card_id: "card_abc123",
  outcome: "success",
  agent: "claude_code",
  tokens_before_estimate: 12000,
  tokens_after_actual: 2400,
  stack: ["Next.js 16", "Fly.io"],
  notes: "Fix worked after enabling trust proxy."
})`,
        },
      ],
    },
    capture: {
      kicker: "CAPTURE A NEW FIX",
      title: "Turn a solved problem into reusable context.",
      body: "Publishing is intentionally separated into draft, review, and explicit approval. Drafts remain private and are not searchable.",
      steps: [
        {
          title: "1. Draft from evidence",
          body: "Pass a work log, diff, test output, commit, or conversation. ClaudexHub extracts useful fields and redacts secrets before storage.",
          code: `draft_context_card({
  source: "conversation",
  repo: "org/project",
  files: ["src/auth/cookies.ts"],
  problem_summary: "Secure OAuth cookie missing in production",
  content: "Relevant logs, diff, and investigation notes...",
  verified_fix: [
    "Enable trust proxy",
    "Keep secure cookies enabled in production"
  ],
  verification: [
    "Complete OAuth flow through the production proxy",
    "Confirm the state cookie reaches the callback"
  ]
})`,
        },
        {
          title: "2. Review the redaction report",
          body: "Submit the draft for review. Check the extracted fix, environment, evidence links, and every redaction finding before publishing.",
          code: `submit_for_approval({
  id: "card_new123",
  visibility_suggestion: "team"
})`,
        },
        {
          title: "3. Publish with explicit approval",
          body: "Publishing requires approve=true and runs secret detection again. Choose public, private, or team visibility.",
          code: `publish_context_card({
  id: "card_new123",
  approve: true,
  visibility: "team"
})`,
        },
      ],
      staleTitle: "When a fix becomes outdated",
      staleBody: "Mark it stale with the affected versions. Stale cards are removed from search results so agents do not keep applying obsolete fixes.",
      staleCode: `mark_stale({
  card_id: "card_abc123",
  reason: "Next.js 17 changed cookie defaults",
  affected_versions: ["Next.js 17+"]
})`,
    },
    tools: {
      kicker: "MCP TOOLKIT",
      title: "Seven tools, one memory lifecycle.",
      body: "Search returns compact briefs first. Full context is fetched only when useful, while approval and feedback keep the shared memory trustworthy.",
      browse: "Browse public cards",
      rows: [
        ["search_context", "Hybrid search with stack, version, error, file, repository, and confidence filters."],
        ["get_context_card", "Read a brief, the full card, or a compact agent_json payload."],
        ["draft_context_card", "Create a private, redacted draft from logs, diffs, commits, or conversations."],
        ["submit_for_approval", "Move a draft into human review and inspect the redaction report."],
        ["publish_context_card", "Publish only after explicit approval and a second secret scan."],
        ["record_feedback", "Record success, partial success, failure, and estimated token savings."],
        ["mark_stale", "Remove an outdated or incorrect fix from future search results."],
      ],
    },
    safety: {
      kicker: "SAFE BY DEFAULT",
      title: "Keep the knowledge. Leave the secrets out.",
      body: "ClaudexHub scans drafts before storage and scans again before publishing. API keys, JWTs, database URLs, emails, and other sensitive values are redacted.",
    },
    tips: {
      kicker: "BEST PRACTICES",
      title: "Get better results from day one.",
      items: [
        ["Search with evidence", "Include the exact error, framework version, file paths, and repository. These signals improve ranking."],
        ["Prefer agent_json", "Use the compact mode for agent context. Fetch full cards only when deeper evidence is necessary."],
        ["Verify before trusting", "A high-confidence card is still reference material. Check environment and run verification steps."],
        ["Close the loop", "Always record feedback. Real reuse outcomes improve confidence for every future agent."],
        ["Capture proven fixes", "Publish only after the solution has been tested. Keep uncertain hypotheses in private drafts."],
        ["Retire stale knowledge", "Mark fixes stale as soon as versions or platform behavior make them unreliable."],
      ],
    },
    cta: {
      overline: "YOUR AGENTS ALREADY SOLVE HARD PROBLEMS",
      title: "Make sure the next agent remembers.",
      body: "Connect ClaudexHub, run your first search, and start building reusable engineering memory today.",
      start: "Get started",
      search: "Search public knowledge",
    },
  },
  ko: {
    nav: { guide: "사용 가이드", tools: "도구", safety: "보안" },
    hero: {
      eyebrow: "AI 코딩 에이전트를 위한 공유 메모리",
      titleA: "한 번 해결한 문제를",
      titleB: "다시 풀지 마세요.",
      body: "Claude Code, Codex, Cursor, Antigravity가 팀의 검증된 해결책을 검색하고, 필요한 컨텍스트만 적용하고, 새로운 해결책을 다음 에이전트를 위해 저장합니다.",
      start: "3분 만에 시작하기",
      github: "GitHub에서 보기",
      proof: ["호스팅 MCP", "민감 정보 자동 제거", "사람의 게시 승인"],
      prompt: "프로덕션에서만 OAuth 쿠키가 사라져",
      searching: "검증된 해결책을 검색하는 중...",
      result: "리버스 프록시 환경에서는 trust proxy와 secure cookie 설정을 함께 확인하세요.",
      response: "같은 배포 환경에서 검증된 해결책을 찾았습니다. 현재 코드와 호환되는지 확인한 뒤 참고 자료로 적용할게요.",
      saved: "약 8,400 tokens 절약",
      aria: "ClaudexHub 사용 예시",
    },
    metrics: ["MCP 도구", "민감 정보 검사", "키워드 + 의미 검색", "공개 Context Card"],
    quick: {
      kicker: "빠른 시작",
      title: "명령어 한 줄로 에이전트를 연결하세요.",
      body: "브라우저에서 한 번 로그인하면 CLI가 호스팅 API 토큰을 만들고 선택한 에이전트에 ClaudexHub를 자동 등록합니다.",
      prereq: "준비 사항",
      prereqBody: "Node.js 20 이상과 지원되는 에이전트 중 하나가 설치되어 있어야 합니다.",
      tokenLabel: "STEP 1 · 에이전트 선택",
      tokenTitle: "에이전트에 맞는 연결 명령어를 실행하세요.",
      tokenBody: "GitHub 로그인을 위한 브라우저가 열립니다. 승인하면 CLI가 토큰을 안전하게 저장하고 에이전트의 전역 MCP 설정을 갱신합니다.",
      connectLabel: "STEP 2 · 연결",
      agentHelp: {
        claude: "Claude Code 사용자 범위에 호스팅 HTTP MCP 서버를 등록합니다.",
        codex: "Codex CLI에 서버를 등록하고 bearer token 환경 변수를 설정합니다.",
        cursor: "기존 서버를 보존하면서 ~/.cursor/mcp.json에 ClaudexHub를 추가합니다.",
        antigravity: "Antigravity, IDE, CLI가 공유하는 ~/.gemini/config/mcp_config.json에 ClaudexHub를 추가합니다.",
      },
      verifyLabel: "STEP 3 · 연결 확인",
      verifyBody: "필요하면 에이전트를 재시작하거나 새로고침하고 ClaudexHub 도구 7개가 보이는지 확인한 다음 이렇게 요청하세요.",
      verifyPrompt: "이 오류를 처음부터 디버깅하기 전에 ClaudexHub에서 비슷한 검증 사례를 먼저 찾아줘.",
      connectNote: "이 명령은 https://claudexhub.fly.dev/api/mcp에 연결합니다. JSON 편집이나 로컬 DB 설정은 필요 없습니다.",
    },
    guide: {
      kicker: "사용 가이드",
      title: "검색 → 적용 → 기록의 전체 흐름.",
      body: "복잡한 디버깅 전에 먼저 검색하고, 검증된 결과를 작업이 끝난 뒤 다시 남길 때 가장 효과적입니다.",
      steps: [
        {
          number: "01",
          title: "디버깅 전에 검색",
          body: "문제를 자연어로 설명하고 기술 스택, 버전, 오류 문구, 관련 파일, 저장소를 가능한 만큼 함께 전달하세요. 검색 결과는 의도적으로 짧은 요약만 반환합니다.",
          code: `search_context({
  query: "프록시 뒤에서 OAuth 쿠키가 사라짐",
  stack: ["Next.js", "Fly.io"],
  version: ["Next.js 16"],
  error: "state cookie was missing",
  files: ["app/api/auth/callback/route.ts"],
  repo: "junseo2323/claudexHub",
  min_confidence: 70,
  limit: 5
})`,
        },
        {
          number: "02",
          title: "가장 적합한 카드만 조회",
          body: "agent_json 모드는 문제, 환경, 검증된 해결책, 검증 단계, 에이전트 힌트, 신뢰도만 간결하게 반환합니다. 모든 근거가 필요할 때만 full을 사용하세요.",
          code: `get_context_card({
  id: "card_abc123",
  mode: "agent_json"
})`,
        },
        {
          number: "03",
          title: "적용하고 검증",
          body: "카드는 실행 명령이 아닌 참고 자료입니다. 버전과 환경을 비교하고 필요한 최소 변경만 적용한 뒤 카드에 적힌 검증 단계를 실행하세요.",
          code: `추천 에이전트 요청:
"이 카드는 참고 자료로 사용해. 코드를 바꾸기 전에
현재 저장소와 호환되는지 확인하고,
카드에 적힌 검증 절차를 실행해."`,
        },
        {
          number: "04",
          title: "사용 결과 기록",
          body: "카드를 사용한 뒤 성공, 부분 성공, 실패를 기록하세요. 신뢰도, 재사용 횟수, 실제 절약 토큰이 갱신됩니다.",
          code: `record_feedback({
  card_id: "card_abc123",
  outcome: "success",
  agent: "claude_code",
  tokens_before_estimate: 12000,
  tokens_after_actual: 2400,
  stack: ["Next.js 16", "Fly.io"],
  notes: "trust proxy 활성화 후 해결됨"
})`,
        },
      ],
    },
    capture: {
      kicker: "새 해결책 기록",
      title: "해결한 문제를 재사용 가능한 컨텍스트로 만드세요.",
      body: "게시는 초안, 검토, 명시적 승인으로 분리됩니다. 초안은 비공개이며 검색 결과에 노출되지 않습니다.",
      steps: [
        {
          title: "1. 근거에서 초안 생성",
          body: "작업 로그, diff, 테스트 출력, 커밋 또는 대화를 전달하세요. 유용한 필드를 추출하고 저장 전에 민감 정보를 제거합니다.",
          code: `draft_context_card({
  source: "conversation",
  repo: "org/project",
  files: ["src/auth/cookies.ts"],
  problem_summary: "프로덕션에서 secure OAuth 쿠키가 사라짐",
  content: "관련 로그, diff, 조사 과정...",
  verified_fix: [
    "trust proxy 활성화",
    "프로덕션 secure cookie 유지"
  ],
  verification: [
    "프로덕션 프록시를 통해 OAuth 완료",
    "state 쿠키가 callback에 도착하는지 확인"
  ]
})`,
        },
        {
          title: "2. 민감 정보 제거 결과 검토",
          body: "초안을 검토 단계로 이동하고 추출된 해결책, 환경, 근거 링크, 민감 정보 제거 항목을 모두 확인하세요.",
          code: `submit_for_approval({
  id: "card_new123",
  visibility_suggestion: "team"
})`,
        },
        {
          title: "3. 명시적으로 승인하고 게시",
          body: "게시에는 approve=true가 필요하며 민감 정보를 다시 검사합니다. 공개, 비공개, 팀 공개 범위를 선택할 수 있습니다.",
          code: `publish_context_card({
  id: "card_new123",
  approve: true,
  visibility: "team"
})`,
        },
      ],
      staleTitle: "해결책이 오래되었을 때",
      staleBody: "영향받는 버전과 함께 stale로 표시하세요. 오래된 카드는 검색에서 제외되어 에이전트가 잘못된 해결책을 반복 적용하지 않습니다.",
      staleCode: `mark_stale({
  card_id: "card_abc123",
  reason: "Next.js 17에서 쿠키 기본값이 변경됨",
  affected_versions: ["Next.js 17+"]
})`,
    },
    tools: {
      kicker: "MCP 도구",
      title: "7개의 도구로 관리하는 지식의 전체 수명주기.",
      body: "검색은 먼저 짧은 요약을 반환하고 필요할 때만 전체 컨텍스트를 가져옵니다. 승인과 피드백 흐름이 공유 지식의 신뢰도를 유지합니다.",
      browse: "공개 카드 둘러보기",
      rows: [
        ["search_context", "스택, 버전, 오류, 파일, 저장소, 신뢰도 필터를 지원하는 하이브리드 검색"],
        ["get_context_card", "요약, 전체 카드 또는 간결한 agent_json 형식으로 조회"],
        ["draft_context_card", "로그, diff, 커밋, 대화에서 민감 정보가 제거된 비공개 초안 생성"],
        ["submit_for_approval", "초안을 사람의 검토 단계로 이동하고 제거 결과 확인"],
        ["publish_context_card", "명시적 승인과 두 번째 민감 정보 검사 후 게시"],
        ["record_feedback", "성공, 부분 성공, 실패와 예상 절약 토큰 기록"],
        ["mark_stale", "오래되거나 잘못된 해결책을 이후 검색에서 제외"],
      ],
    },
    safety: {
      kicker: "기본으로 안전하게",
      title: "지식은 남기고 비밀은 남기지 않습니다.",
      body: "초안 저장 전과 게시 직전에 두 번 검사해 API 키, JWT, DB URL, 이메일 등 민감한 값을 제거합니다.",
    },
    tips: {
      kicker: "권장 사용법",
      title: "처음부터 더 정확한 결과를 얻으세요.",
      items: [
        ["근거와 함께 검색", "정확한 오류, 프레임워크 버전, 파일 경로, 저장소를 포함하면 검색 순위가 좋아집니다."],
        ["agent_json 우선", "에이전트 컨텍스트에는 간결한 모드를 사용하고 깊은 근거가 필요할 때만 전체 카드를 가져오세요."],
        ["적용 전 검증", "신뢰도가 높아도 카드는 참고 자료입니다. 환경을 비교하고 검증 절차를 실행하세요."],
        ["피드백으로 마무리", "항상 사용 결과를 기록하세요. 실제 재사용 결과가 이후 모든 에이전트의 신뢰도를 개선합니다."],
        ["검증된 해결책만 게시", "테스트가 끝난 해결책만 게시하고 불확실한 가설은 비공개 초안으로 유지하세요."],
        ["오래된 지식 정리", "버전이나 플랫폼 동작이 바뀌면 즉시 stale로 표시하세요."],
      ],
    },
    cta: {
      overline: "에이전트는 이미 어려운 문제를 해결하고 있습니다",
      title: "다음 에이전트가 그 해결책을 기억하게 하세요.",
      body: "ClaudexHub를 연결하고 첫 검색을 실행해 재사용 가능한 엔지니어링 메모리를 만들어 보세요.",
      start: "지금 시작하기",
      search: "공개 지식 검색",
    },
  },
} as const;

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>;
}

export function CopyBlock({
  code,
  language = "json",
  locale = "en",
}: {
  code: string;
  language?: string;
  locale?: Locale;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="copy-block">
      <div className="copy-block-top">
        <span>{language}</span>
        <button type="button" onClick={handleCopy} aria-label={locale === "en" ? "Copy code" : "코드 복사"}>
          {copied ? (locale === "en" ? "Copied ✓" : "복사됨 ✓") : locale === "en" ? "Copy" : "복사"}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function SetupPanel({ locale }: { locale: Locale }) {
  const [agent, setAgent] = useState<Agent>("claude");
  const t = copy[locale].quick;

  return (
    <div className="quickstart-shell">
      <div className="quickstart-content">
        <div className="prerequisite">
          <b>{t.prereq}</b>
          <span>{t.prereqBody}</span>
        </div>

        <div className="step-label">{t.tokenLabel}</div>
        <h3>{t.tokenTitle}</h3>
        <p>{t.tokenBody}</p>
        <div className="tab-list" role="tablist" aria-label={locale === "en" ? "Choose agent" : "에이전트 선택"}>
          <button className={agent === "claude" ? "active" : ""} type="button" onClick={() => setAgent("claude")}>Claude Code</button>
          <button className={agent === "codex" ? "active" : ""} type="button" onClick={() => setAgent("codex")}>Codex</button>
          <button className={agent === "cursor" ? "active" : ""} type="button" onClick={() => setAgent("cursor")}>Cursor</button>
          <button className={agent === "antigravity" ? "active" : ""} type="button" onClick={() => setAgent("antigravity")}>Antigravity</button>
        </div>
        <p className="tab-help">{t.agentHelp[agent]}</p>

        <div className="step-divider" />
        <div className="step-label">{t.connectLabel}</div>
        <CopyBlock code={connectCommands[agent]} language="terminal" locale={locale} />
        <div className="quick-note"><span>i</span><p>{t.connectNote}</p></div>

        <div className="step-divider" />
        <div className="step-label">{t.verifyLabel}</div>
        <p className="verify-copy">{t.verifyBody}</p>
        <div className="first-prompt">“{t.verifyPrompt}”</div>
      </div>
    </div>
  );
}

function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  return (
    <div className="locale-toggle" role="group" aria-label="Language">
      <button type="button" className={locale === "en" ? "active" : ""} onClick={() => onChange("en")}>EN</button>
      <button type="button" className={locale === "ko" ? "active" : ""} onClick={() => onChange("ko")}>한국어</button>
    </div>
  );
}

export function DocsLanding({ cardsPublished }: { cardsPublished: number }) {
  const [locale, setLocale] = useState<Locale>("en");
  const t = copy[locale];

  useEffect(() => {
    const saved = window.localStorage.getItem("claudexhub-locale");
    if (saved === "en" || saved === "ko") {
      setLocale(saved);
      document.documentElement.lang = saved;
    }
  }, []);

  function changeLocale(next: Locale) {
    setLocale(next);
    window.localStorage.setItem("claudexhub-locale", next);
    document.documentElement.lang = next;
  }

  return (
    <div className="docs-page">
      <div className="docs-subnav">
        <nav>
          <a href="#usage">{t.nav.guide}</a>
          <a href="#tools">{t.nav.tools}</a>
          <a href="#safety">{t.nav.safety}</a>
        </nav>
        <LocaleToggle locale={locale} onChange={changeLocale} />
      </div>

      <section className="docs-hero">
        <div className="hero-glow" />
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" />{t.hero.eyebrow}</div>
          <h1>{t.hero.titleA}<br /><span>{t.hero.titleB}</span></h1>
          <p>{t.hero.body}</p>
          <div className="hero-actions">
            <a className="docs-button primary" href="#quickstart">{t.hero.start} <ArrowIcon /></a>
            <a className="docs-button secondary" href="https://github.com/junseo2323/claudexHub" target="_blank" rel="noreferrer">{t.hero.github}</a>
          </div>
          <div className="hero-proof">
            {t.hero.proof.map((item) => <span key={item}><CheckIcon /> {item}</span>)}
          </div>
        </div>

        <div className="hero-terminal" aria-label={t.hero.aria}>
          <div className="terminal-top">
            <div className="terminal-dots"><i /><i /><i /></div>
            <span>agent · claudexhub</span>
            <span className="terminal-live">● connected</span>
          </div>
          <div className="terminal-body">
            <div className="terminal-line"><span className="prompt">›</span><span>{t.hero.prompt}</span></div>
            <div className="terminal-event"><span className="tool-mark">◇</span><div><b>search_context</b><small>{t.hero.searching}</small></div></div>
            <div className="terminal-result">
              <div className="result-head">
                <span className="result-score">92</span>
                <div><b>Secure cookie behind reverse proxy</b><small>Next.js · OAuth · Fly.io</small></div>
                <span className="match">best match</span>
              </div>
              <p>{t.hero.result}</p>
            </div>
            <div className="terminal-response"><span className="spark">✦</span><p>{t.hero.response}</p></div>
            <div className="terminal-saving"><span>context saved</span><b>{t.hero.saved}</b></div>
          </div>
        </div>
      </section>

      <section className="docs-metrics" aria-label="Product metrics">
        <div><strong>7</strong><span>{t.metrics[0]}</span></div>
        <div><strong>2-step</strong><span>{t.metrics[1]}</span></div>
        <div><strong>Hybrid</strong><span>{t.metrics[2]}</span></div>
        <div><strong>{cardsPublished.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}</strong><span>{t.metrics[3]}</span></div>
      </section>

      <section className="docs-section" id="quickstart">
        <div className="section-heading">
          <span className="section-kicker">{t.quick.kicker}</span>
          <h2>{t.quick.title}</h2>
          <p>{t.quick.body}</p>
        </div>
        <SetupPanel locale={locale} />
      </section>

      <section className="docs-section workflow-section" id="usage">
        <div className="section-heading">
          <span className="section-kicker">{t.guide.kicker}</span>
          <h2>{t.guide.title}</h2>
          <p>{t.guide.body}</p>
        </div>
        <div className="usage-steps">
          {t.guide.steps.map((item) => (
            <article className="usage-step" key={item.number}>
              <div className="usage-copy">
                <span className="workflow-number">{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
              <CopyBlock code={item.code} locale={locale} />
            </article>
          ))}
        </div>
      </section>

      <section className="docs-section capture-section" id="capture">
        <div className="section-heading">
          <span className="section-kicker">{t.capture.kicker}</span>
          <h2>{t.capture.title}</h2>
          <p>{t.capture.body}</p>
        </div>
        <div className="capture-grid">
          {t.capture.steps.map((item) => (
            <article className="capture-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <CopyBlock code={item.code} locale={locale} />
            </article>
          ))}
        </div>
        <div className="stale-guide">
          <div><h3>{t.capture.staleTitle}</h3><p>{t.capture.staleBody}</p></div>
          <CopyBlock code={t.capture.staleCode} locale={locale} />
        </div>
      </section>

      <section className="docs-section tools-section" id="tools">
        <div className="tools-intro">
          <span className="section-kicker">{t.tools.kicker}</span>
          <h2>{t.tools.title}</h2>
          <p>{t.tools.body}</p>
          <Link href="/cards" className="text-link">{t.tools.browse} <ArrowIcon /></Link>
        </div>
        <div className="tool-list">
          {t.tools.rows.map(([name, description], index) => (
            <div className="tool-row" key={name}>
              <span>{String(index + 1).padStart(2, "0")}</span><code>{name}</code><p>{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="docs-section safety-section" id="safety">
        <div className="safety-card">
          <div className="safety-copy">
            <span className="section-kicker">{t.safety.kicker}</span>
            <h2>{t.safety.title}</h2>
            <p>{t.safety.body}</p>
          </div>
          <div className="redaction-demo">
            <div><span>OPENAI_API_KEY</span><code>sk-proj-••••••••••</code><b>redacted</b></div>
            <div><span>DATABASE_URL</span><code>postgres://••••••</code><b>redacted</b></div>
            <div className="safe-line"><span>framework</span><code>Next.js 16</code><b>kept</b></div>
          </div>
        </div>
      </section>

      <section className="docs-section tips-section">
        <div className="section-heading">
          <span className="section-kicker">{t.tips.kicker}</span>
          <h2>{t.tips.title}</h2>
        </div>
        <div className="tips-grid">
          {t.tips.items.map(([title, body], index) => (
            <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
      </section>

      <section className="docs-cta">
        <span>{t.cta.overline}</span>
        <h2>{t.cta.title}</h2>
        <p>{t.cta.body}</p>
        <div className="hero-actions">
          <a className="docs-button primary" href="#quickstart">{t.cta.start} <ArrowIcon /></a>
          <Link className="docs-button secondary" href="/search">{t.cta.search}</Link>
        </div>
      </section>
    </div>
  );
}
