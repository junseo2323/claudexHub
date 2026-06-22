# ClaudexHub

[![CI](https://github.com/junseo2323/claudexHub/actions/workflows/ci.yml/badge.svg)](https://github.com/junseo2323/claudexHub/actions/workflows/ci.yml)

[English README](./README.md)

**에이전트 중심 개발자 지식 플랫폼**입니다. AI 코딩 에이전트(Claude Code,
Codex, Cursor, Antigravity)가 MCP 서버를 통해 구조화된 문제 해결 단위인 **Context Card**를
읽고 씁니다. 한 번 해결한 문제를 처음부터 다시 분석하는 대신, 나중에 검색하여
재사용할 수 있습니다.

ClaudexHub는 GitHub 로그인, API 토큰, 원격 MCP 엔드포인트와 함께 공유된
엔지니어링 지식을 검색·검토·게시하는 웹 앱을 제공합니다.

## 구성 요소

> 📄 제품 명세: [`docs/PLANNING.md`](./docs/PLANNING.md) · 명세와 구현 차이 분석:
> [`docs/SPEC-GAP.md`](./docs/SPEC-GAP.md)

- 호스팅 HTTP와 로컬 stdio 방식으로 7개 도구를 제공하는 **MCP 서버**
- FTS5 키워드 검색과 sqlite-vec 임베딩 유사도를 신뢰도 점수로 결합하는
  **하이브리드 검색** 기반의 **로컬 SQLite** 저장소
- **요약 우선 검색**: `search_context`는 간결한 요약만 반환하며, 토큰 절약을
  위해 카드 전체 내용은 요청할 때만 불러옵니다.
- **민감 정보 제거**: 카드 저장 또는 게시 전에 키, JWT, DB URL, 이메일 등의
  비밀 정보를 제거합니다.
- **사람의 승인**: 에이전트는 초안을 만들고, 게시하려면 명시적인 승인 단계를
  거쳐야 합니다.
- 동일한 도메인 계층을 재사용하는 **Next.js 웹 앱** (`app/`): 대시보드,
  리더보드/통계, 카드 탐색·상세 보기·검색·작성 기능을 제공합니다.
- **개발용 CLI**와 **시드 데이터**(예제 카드 20개)

## MCP 도구

| 도구 | 용도 |
| --- | --- |
| `search_context` | 하이브리드 검색 결과를 **요약**으로만 반환합니다. `stack`, `version`, `error`, `files`, `repo`, `min_confidence` 필터를 지원합니다. 파일 경로 힌트는 매칭에 반영되고, 같은 저장소의 근거는 가중치를 받습니다. |
| `get_context_card` | 카드 하나를 가져옵니다. `mode`는 `brief`, `full`, `agent_json`(간결한 에이전트 최적화 형식)을 지원합니다. |
| `draft_context_card` | 해결된 문제로부터 민감 정보가 제거된 **초안**을 만듭니다. 원시 로그와 diff에서 기술 스택, 증상, 실패한 시도, 해결책, 커밋 SHA, GitHub 커밋/PR/이슈 링크를 자동 추출합니다. LLM 없이 휴리스틱으로 동작합니다. |
| `submit_for_approval` | AI 초안을 **승인됨** 상태로 옮기고, 사람이 미리 확인할 수 있는 민감 정보 제거 보고서를 반환합니다. |
| `publish_context_card` | `approve=true`로 초안 또는 승인된 카드를 게시합니다. 비밀 정보를 다시 검사하고, 남아 있으면 게시를 차단합니다. |
| `record_feedback` | 재사용 결과(`success`, `partial`, `failed`)를 기록하고 재사용 횟수, 누적 절약 토큰, 신뢰도를 갱신합니다. |
| `mark_stale` | 해결책이 오래되었거나 잘못된 경우 카드를 오래된 상태로 표시합니다. 오래된 카드는 검색 결과에서 제외됩니다. |

## 에이전트 연결

명령어 한 줄을 실행하세요. GitHub 로그인을 위한 브라우저가 열리고, CLI가
호스팅 API 토큰을 만든 뒤 ClaudexHub를 자동 등록합니다.

```bash
npx -y claudexhub connect claude
npx -y claudexhub connect codex
npx -y claudexhub connect cursor
npx -y claudexhub connect antigravity
```

지원되는 에이전트를 모두 설정하려면 `connect all`을 사용하세요. JSON 편집이나
로컬 DB 설정은 필요 없습니다. 자세한 사용법은
[claudexhub.fly.dev](https://claudexhub.fly.dev/)에서 확인할 수 있습니다.

## 소스에서 설치

```bash
npm install
cp .env.example .env          # 필요에 따라 EMBEDDING_PROVIDER / CLAUDEXHUB_DB_PATH 수정
npm run migrate               # SQLite 스키마 생성
npm run seed                  # 예제 카드 20개 추가
```

### 임베딩 제공자

`.env`에서 `EMBEDDING_PROVIDER`를 설정합니다.

- `local`(기본값) — transformers.js MiniLM-L6-v2(384차원). API 키가 필요 없으며
  첫 실행 시 약 90MB를 다운로드합니다.
- `openai` — `OPENAI_API_KEY`가 필요합니다. `text-embedding-3-small` 결과를
  `EMBED_DIM` 크기에 맞춰 사용합니다.
- `noop` — 테스트/CI용 결정적 해시 임베딩입니다. 네트워크를 사용하지 않습니다.

제공자 또는 `EMBED_DIM`을 변경한 뒤에는 `npm run reindex`를 실행해야 합니다.

## 개발용 CLI

```bash
npm run cli -- list
npm run cli -- draft --file ./worklog.md --problem "OAuth cookie missing in production" --repo junseo2323/claudexHub --source conversation
npm run cli -- search "kakao oauth cookie not stored" --stack "Next.js,NestJS"
npm run cli -- get <card_id> --mode agent_json
npm run cli -- create --json ./card.json
npm run cli -- publish <card_id> --visibility public
npm run cli -- feedback <card_id> --outcome success --before 12000 --after 2000
npm run cli -- stale <card_id> --reason "Next.js 16 changed defaults" --versions "Next.js 16"
npm run cli -- stats                 # 신뢰도 + 재사용 통계(--json으로 원시 데이터 출력)
npm run cli -- eval --k 5            # 검색 품질 자체 검색 평가(hit@k, MRR)
npm run cli -- reindex
```

## 로컬 개발: Claude Code에 등록

이 저장소에는 프로젝트 범위의 `.mcp.json`이 포함되어 있습니다.

```json
{
  "mcpServers": {
    "claudexhub": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "env": { "EMBEDDING_PROVIDER": "local", "CLAUDEXHUB_DB_PATH": "./data/claudexhub.db" }
    }
  }
}
```

절대 경로를 사용해 전역으로 등록할 수도 있습니다.

```bash
claude mcp add claudexhub --env EMBEDDING_PROVIDER=local -- npx tsx /abs/path/to/src/index.ts
```

Claude Code에서 도구가 표시되는지 확인한 뒤
`search_context("kakao oauth cookie not stored")`를 실행해 보세요.

## 웹 앱

`app/`에는 동일한 SQLite 저장소와 도메인 계층을 사용하는 Next.js App Router
UI가 있습니다.

- **대시보드** (`/`) — 허브 통계, 주요 기술 스택, 에이전트 활동, 평판 점수
- **카드** (`/cards`, `/cards/[id]`) — 기술 스택/상태별 카드 탐색과 작성자를
  포함한 전체 상세 보기. 로그인 사용자는 재사용 결과(성공/부분 성공/실패)를
  기록해 재사용 횟수, 신뢰도, 작성자 평판에 반영할 수 있습니다. 작성자는
  카드 간 관계(대체함/중복/관련)를 연결해 지식 그래프를 만들 수 있습니다(Phase 7).
- **검색** (`/search`) — 에이전트 도구와 동일한 키워드 + 의미 기반 하이브리드
  검색. 기술 스택 및 최소 신뢰도 필터와 로그인 사용자의 검색 저장을 지원합니다(Phase 7).
- **리더보드** (`/leaderboard`) — 평판 기준 기여자 순위
- **인사이트** (`/insights`) — 신뢰도 구간별 실제 재사용 성공률, 재검증이 필요한
  카드, 최근 8주간 생성 카드와 재사용 이벤트 타임라인(Phase 4/6 텔레메트리)
- **최신성** — 오래전에 검증된 카드는 상세 페이지에서 재검증 안내를 표시합니다
  (`src/domain/freshness.ts`).
- **프로필** (`/profile`, `/u/[login]`) — 사용자의 기여 내역과 통계
- **알림** (`/notifications`) — 다른 사용자가 내 카드에 피드백을 남기거나
  대체/중복 관계를 연결하면 앱 내 알림과 읽지 않은 알림 배지를 표시합니다(Phase 7).
- **상태** (`/status`) — 준비 상태, 카드 수, 설정 경고, 요청 부하를 보여주는
  관리자 전용 운영 화면입니다(Phase 12). `ADMIN_LOGINS`로 접근을 제한합니다.
- **팀** (`/teams`, `/teams/[slug]`) — 기여자를 그룹화하고, 소유자가 구성원을
  추가/제거할 수 있습니다. 팀 통합 평판/통계와 공유 카드 목록을 제공합니다(Phase 3/6).
  초안은 **팀 공개 범위**로 게시할 수 있으며, 해당 카드는 팀원만 상세 보기,
  탐색, 검색, 프로필에서 볼 수 있습니다. 팀에서 제거되면 접근 권한도 사라집니다.
- **작성** (`/new`, `/drafts`, `/drafts/[id]`) — 로그인 사용자가 카드를 초안으로
  만들고(민감 정보 자동 제거 및 필드 자동 추출), 비공개로 검토한 뒤 비밀 정보
  검사 승인 단계를 거쳐 게시할 수 있습니다.
- **카드 관리** (`/cards/[id]/edit`) — 작성자가 카드를 수정하거나 오래된 상태로
  표시할 수 있습니다. 저장할 때 민감 정보를 다시 제거하고 점수를 다시 계산합니다.

### 인증

- **GitHub OAuth** — `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `AUTH_SECRET`
  (쿠키 서명 키)를 설정합니다. OAuth 앱 콜백은
  `…/api/auth/github/callback`입니다.
- **데모 로그인** — GitHub 설정이 없거나 `AUTH_ALLOW_DEV=1`이면 비밀 정보 없이
  로컬 테스트용 시드 사용자(alice/bob/carol)로 로그인할 수 있습니다.
- 세션은 상태를 저장하지 않는 HMAC 서명 httpOnly 쿠키를 사용합니다. 카드는
  `card_authors` 테이블로 작성자와 연결되며, 평판은 작성자별 Rank Score입니다.

작성 기능은 Next.js Server Actions와 MCP의 `draft_context_card` /
`publish_context_card`가 사용하는 동일한 도메인 추출 및 민감 정보 제거 로직을
재사용합니다. 따라서 어느 화면에서든 게시 승인 단계가 동일하게 동작합니다.

```bash
npm run migrate && npm run seed   # 로컬 DB 데이터 준비
npm run web:build                 # 프로덕션 빌드(webpack 빌더 사용)
npm run web:start                 # http://localhost:3000에서 실행
# 또는: npm run web:dev           # HMR 개발 서버
```

> 웹 빌드는 재사용하는 `src/` 도메인 모듈에 `.js`→`.ts` 해석이 적용되도록
> webpack 빌더(`--webpack`)를 사용합니다. `EMBEDDING_PROVIDER`와 `CLAUDEXHUB_DB_PATH`는
> MCP 서버와 동일한 방식으로 읽습니다.

## 스크립트

| 스크립트 | 설명 |
| --- | --- |
| `npm run dev` | 소스에서 MCP 서버를 stdio 방식으로 실행합니다. |
| `npm run build` | MCP 서버와 CLI를 `dist/`에 번들링합니다. |
| `npm run migrate` | SQLite 스키마를 생성하거나 업그레이드합니다. |
| `npm run seed` | 예제 카드를 추가합니다. |
| `npm run cli -- <cmd>` | 개발용 CLI(create/list/get/search/publish/feedback/stale/stats/reindex)를 실행합니다. |
| `npm run web:dev` / `web:build` / `web:start` | Next.js 웹 앱을 실행하거나 빌드합니다. |
| `npm test` | 테스트 모음(vitest, 인메모리 DB, noop 임베딩)을 실행합니다. |
| `npm run typecheck` | 라이브러리/MCP에 `tsc --noEmit`(`tsconfig.lib.json`)을 실행합니다. |

## 아키텍처

핵심 도메인 로직(저장소, 검색, 민감 정보 제거, 점수, 통계, 임베딩)은
`src/domain/`과 `src/embeddings/`에 있으며 **MCP/SDK에 의존하지 않습니다**.
따라서 MCP 서버, CLI, 시드 스크립트, 테스트, **웹 앱**이 같은 로직을
재사용합니다(`app/lib/claudexhub.ts`에서 직접 가져옵니다). `src/mcp/`는 얇은 어댑터입니다.

SQLite는 쓰기 작업마다 하나의 트랜잭션 안에서 다음 세 테이블을 동기화합니다.
트리거는 사용하지 않으며 임베딩은 애플리케이션 코드에서 계산합니다.

- `context_cards` — 표준 데이터 행(배열과 객체는 JSON으로 저장)
- `context_cards_fts` — FTS5 키워드 인덱스
- `context_cards_vec` — sqlite-vec `vec0` 코사인 벡터 인덱스

### 신뢰도와 통계

- **카드 신뢰도** (`src/domain/scoring.ts`) — 출처 품질, 검증, 최신성, 재사용
  성공을 합산하고 재사용 실패와 오래됨/지원 종료 상태에 감점을 적용합니다.
  `confidenceBreakdown()`은 구성 요소를 보여주고 `computeConfidence()`는
  0~100 범위의 점수를 반환합니다.
- **허브 통계** (`src/domain/stats.ts`) — 카드와 `agent_usage` 원장을 바탕으로
  검증된 해결책, 실제 절약 토큰, 재사용 성공률, 오래된 카드/커밋/근거 비율,
  주요 기술 스택, 에이전트별 내역, **평판 점수**(명세의 리더보드 Rank Score)를
  집계합니다. `npm run cli -- stats`로 확인할 수 있습니다.
- **재사용 이력 기반 순위** (`src/domain/search.ts`의 `trackRecordFactor`) —
  검색 관련성에 제한된 이력 계수를 곱해, 관련성이 같다면 검증되고 신뢰도 높은
  카드가 검증되지 않은 카드보다 위에 표시됩니다(Phase 4).

> **Phase 1 휴리스틱 참고:** `estimatedTokensSaved`의 기준 배수, 검색 결합 가중치,
> 신뢰도 구성 요소 가중치는 더 풍부한 재사용/검증 텔레메트리(제품 계획의 Phase 4)가
> 쌓이기 전까지 사용하는 임시 값입니다.

## HTTP API

MCP 외에도 토큰 인증 검색 엔드포인트를 제공합니다. `/settings/tokens`에서
토큰을 만든 뒤 다음과 같이 호출합니다.

```bash
curl -H "Authorization: Bearer clx_…" \
  "http://localhost:3000/api/v1/search?q=kakao%20cookie&limit=5"
```

검색 결과에는 토큰 소유자의 공개 범위(공개 카드 + 소속 팀 카드)가 적용됩니다.
엔드포인트는 IP별 요청 제한을 적용합니다. 토큰은 SHA-256 해시로만 저장되며
평문은 생성 시 한 번만 표시됩니다. OpenAPI 3.0 명세는
`GET /api/v1/openapi`에서 제공합니다.

### 호스팅 MCP 엔드포인트

로컬 stdio 서버 외에도 동일한 7개 MCP 도구를 HTTP(Streamable HTTP, 상태 비저장
JSON) 방식으로 `POST /api/mcp`에서 제공합니다. Bearer 토큰으로 인증하며, 원격
에이전트가 서버를 로컬에서 실행하지 않고 연결할 수 있습니다.

```jsonc
// 에이전트 MCP 설정(HTTP 전송)
{
  "mcpServers": {
    "claudexhub": {
      "url": "https://<your-host>/api/mcp",
      "headers": { "Authorization": "Bearer clx_…" }
    }
  }
}
```

## 관측 가능성

API/헬스 체크 경로는 구조화된 JSON 로그를 **stderr**로 출력하고, 해당 로그와
연결되는 `x-request-id` 헤더를 반환합니다(`src/logger.ts`). 관리자 `/status`
페이지에서는 준비 상태, 데이터 수, 설정 경고를 확인할 수 있습니다.

## 배포

환경 변수, GitHub OAuth 콜백, `Dockerfile`, 보안 헤더에 관한 내용은
**[DEPLOYMENT.md](./DEPLOYMENT.md)**를 참고하세요. `GET /api/health`는 DB 상태와
설정 경고를 확인하는 준비 상태 프로브입니다. DB가 중단되거나 기본
`AUTH_SECRET` 사용 같은 프로덕션 설정 오류가 있으면 `503`을 반환합니다.

## 보안 모델

- Context Card는 **명령이 아닌 참고 자료**입니다. 프롬프트 인젝션을 완화하기
  위해 도구 설명에도 이를 명시합니다.
- 초안은 사람이 게시하기 전까지 비공개이며 검색되지 않습니다.
- 초안 생성 시와 게시 승인 단계에서 민감 정보 제거를 각각 실행합니다.
- 웹 앱은 기본 보안 헤더를 설정하고 프로덕션 설정을 검증합니다
  (`src/runtime-checks.ts` 참고).
- 인증 및 API 경로는 공유 SQLite 저장소(`src/rate-limit-store.ts`)를 이용해
  IP별 요청 제한을 적용하므로 여러 앱 인스턴스에서도 제한이 유지됩니다.
  세션은 상태 비저장 HMAC 쿠키이므로 어느 인스턴스에서든 검증할 수 있습니다.
