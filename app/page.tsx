import Link from "next/link";
import { getStats } from "./lib/hub";
import { CopyBlock, SetupTabs } from "./landing-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const tools = [
  ["search_context", "키워드와 의미를 함께 이해하는 하이브리드 검색"],
  ["get_context_card", "필요한 순간에만 전체 해결 과정 불러오기"],
  ["draft_context_card", "작업 로그에서 해결책 초안 자동 생성"],
  ["submit_for_approval", "게시 전 민감 정보 제거 결과 검토"],
  ["publish_context_card", "검증된 해결책을 팀의 기억으로 저장"],
  ["record_feedback", "재사용 성공 여부와 절약 토큰 기록"],
  ["mark_stale", "오래되거나 잘못된 해결책 검색에서 제외"],
];

const workflow = [
  {
    number: "01",
    title: "먼저 검색합니다",
    body: "에이전트가 새 문제를 분석하기 전에 Context Hub에서 유사한 증상과 환경을 찾습니다.",
    code: 'search_context({ query: "OAuth cookie missing in production", stack: ["Next.js"] })',
  },
  {
    number: "02",
    title: "해결책을 적용합니다",
    body: "검색 결과는 짧은 요약으로 받고, 관련성이 높은 카드만 전체 내용을 불러와 토큰을 아낍니다.",
    code: 'get_context_card({ id: "card_...", mode: "agent_json" })',
  },
  {
    number: "03",
    title: "결과를 다시 남깁니다",
    body: "실제로 통했는지 기록하고, 새로운 해결책은 사람의 승인 후 다음 작업에서 재사용합니다.",
    code: 'record_feedback({ card_id: "card_...", outcome: "success" })',
  },
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 10 3 3 7-7" />
    </svg>
  );
}

export default function DocsHome() {
  const stats = getStats();

  return (
    <div className="docs-page">
      <section className="docs-hero">
        <div className="hero-glow" />
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" />
            MCP 기반 AI 에이전트 메모리
          </div>
          <h1>
            한 번 해결한 문제를
            <br />
            <span>다시 풀지 마세요.</span>
          </h1>
          <p>
            Claude Code와 Cursor가 팀의 해결책을 검색하고, 적용하고, 더 나은 지식으로
            되돌려 놓는 공유 컨텍스트 허브입니다.
          </p>
          <div className="hero-actions">
            <a className="docs-button primary" href="#quickstart">
              3분 만에 시작하기 <ArrowIcon />
            </a>
            <a
              className="docs-button secondary"
              href="https://github.com/junseo2323/claudexHub"
              target="_blank"
              rel="noreferrer"
            >
              GitHub에서 보기
            </a>
          </div>
          <div className="hero-proof">
            <span><CheckIcon /> 로컬 우선</span>
            <span><CheckIcon /> 민감 정보 자동 제거</span>
            <span><CheckIcon /> 사람의 게시 승인</span>
          </div>
        </div>

        <div className="hero-terminal" aria-label="Context Hub 사용 예시">
          <div className="terminal-top">
            <div className="terminal-dots"><i /><i /><i /></div>
            <span>agent · context-hub</span>
            <span className="terminal-live">● connected</span>
          </div>
          <div className="terminal-body">
            <div className="terminal-line">
              <span className="prompt">›</span>
              <span>프로덕션에서 OAuth 쿠키가 저장되지 않아</span>
            </div>
            <div className="terminal-event">
              <span className="tool-mark">◇</span>
              <div>
                <b>search_context</b>
                <small>관련 해결책을 검색하는 중...</small>
              </div>
            </div>
            <div className="terminal-result">
              <div className="result-head">
                <span className="result-score">92</span>
                <div>
                  <b>Secure cookie behind reverse proxy</b>
                  <small>Next.js · OAuth · Fly.io</small>
                </div>
                <span className="match">best match</span>
              </div>
              <p>프록시 환경에서 <code>trust proxy</code>와 secure cookie 설정을 함께 확인하세요.</p>
            </div>
            <div className="terminal-response">
              <span className="spark">✦</span>
              <p>같은 배포 환경에서 검증된 해결책을 찾았어요. 이 카드를 기준으로 설정을 확인할게요.</p>
            </div>
            <div className="terminal-saving">
              <span>context saved</span>
              <b>약 8,400 tokens 절약</b>
            </div>
          </div>
        </div>
      </section>

      <section className="docs-metrics" aria-label="제품 특징">
        <div><strong>7</strong><span>MCP tools</span></div>
        <div><strong>2-step</strong><span>secret scan</span></div>
        <div><strong>Hybrid</strong><span>keyword + semantic</span></div>
        <div>
          <strong>{stats.cardsPublished.toLocaleString()}</strong>
          <span>live context cards</span>
        </div>
      </section>

      <section className="docs-section" id="quickstart">
        <div className="section-heading">
          <span className="section-kicker">QUICKSTART</span>
          <h2>복사하고, 붙여넣고, 바로 사용하세요.</h2>
          <p>별도 서버 구성 없이 npx 한 줄과 에이전트 설정 파일만으로 시작할 수 있습니다.</p>
        </div>

        <div className="quickstart-shell">
          <aside className="quickstart-steps">
            <div className="active"><span>1</span><div><b>데이터 준비</b><small>로컬 DB와 예제 카드 생성</small></div></div>
            <div><span>2</span><div><b>에이전트 연결</b><small>설정 파일에 MCP 추가</small></div></div>
            <div><span>3</span><div><b>첫 검색</b><small>자연어로 해결책 찾기</small></div></div>
          </aside>
          <div className="quickstart-content">
            <div className="step-label">STEP 1 · 로컬 허브 준비</div>
            <h3>명령어 한 줄이면 충분합니다.</h3>
            <p>Node.js 20 이상에서 스키마와 예제 Context Card 20개를 자동으로 준비합니다.</p>
            <CopyBlock code="npx -y ai-agent-context-hub context-hub-cli init" language="terminal" />
            <div className="quick-note">
              <span>i</span>
              <p>처음 실행할 때 로컬 임베딩 모델을 내려받습니다. API 키 없이 내 컴퓨터 안에서 동작합니다.</p>
            </div>
            <div className="step-divider" />
            <div className="step-label">STEP 2 · 사용하는 에이전트에 연결</div>
            <SetupTabs />
          </div>
        </div>
      </section>

      <section className="docs-section workflow-section" id="how-it-works">
        <div className="section-heading">
          <span className="section-kicker">HOW IT WORKS</span>
          <h2>에이전트의 작업 흐름 안에 자연스럽게 들어갑니다.</h2>
          <p>새로운 도구를 따로 배우기보다, 기존 대화 속에서 검색과 기록이 이어집니다.</p>
        </div>
        <div className="workflow-grid">
          {workflow.map((item) => (
            <article className="workflow-card" key={item.number}>
              <span className="workflow-number">{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <code>{item.code}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="docs-section tools-section" id="tools">
        <div className="tools-intro">
          <span className="section-kicker">MCP TOOLKIT</span>
          <h2>검색부터 검증까지,<br />기억의 전체 수명주기.</h2>
          <p>
            Context Card는 단순 메모가 아닙니다. 환경, 증상, 실패한 시도, 해결책,
            검증 결과를 구조화해 에이전트가 바로 사용할 수 있습니다.
          </p>
          <Link href="/cards" className="text-link">공개 카드 둘러보기 <ArrowIcon /></Link>
        </div>
        <div className="tool-list">
          {tools.map(([name, description], index) => (
            <div className="tool-row" key={name}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <code>{name}</code>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="docs-section safety-section" id="safety">
        <div className="safety-card">
          <div className="safety-copy">
            <span className="section-kicker">SAFE BY DEFAULT</span>
            <h2>팀의 지식은 남기고,<br />비밀은 남기지 않습니다.</h2>
            <p>초안 생성과 게시 직전에 두 번 검사해 API 키, JWT, DB URL, 이메일 같은 민감 정보를 제거합니다.</p>
          </div>
          <div className="redaction-demo">
            <div><span>OPENAI_API_KEY</span><code>sk-proj-••••••••••</code><b>redacted</b></div>
            <div><span>DATABASE_URL</span><code>postgres://••••••</code><b>redacted</b></div>
            <div className="safe-line"><span>framework</span><code>Next.js 16</code><b>kept</b></div>
          </div>
        </div>
      </section>

      <section className="docs-cta">
        <span>YOUR AGENTS ALREADY SOLVE HARD PROBLEMS</span>
        <h2>이제 그 해결책을 잊지 않게 하세요.</h2>
        <p>첫 Context Hub를 만들고, 다음 작업부터 바로 재사용하세요.</p>
        <div className="hero-actions">
          <a className="docs-button primary" href="#quickstart">지금 시작하기 <ArrowIcon /></a>
          <Link className="docs-button secondary" href="/search">공개 지식 검색</Link>
        </div>
      </section>
    </div>
  );
}
