"use client";

import { useState } from "react";

const configs = {
  claude: `{
  "mcpServers": {
    "context-hub": {
      "command": "npx",
      "args": ["-y", "ai-agent-context-hub"],
      "env": {
        "EMBEDDING_PROVIDER": "local",
        "HUB_DB_PATH": "./data/hub.db"
      }
    }
  }
}`,
  cursor: `{
  "mcpServers": {
    "context-hub": {
      "command": "npx",
      "args": ["-y", "ai-agent-context-hub"],
      "env": {
        "EMBEDDING_PROVIDER": "local",
        "HUB_DB_PATH": "./data/hub.db"
      }
    }
  }
}`,
};

export function CopyBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="copy-block">
      <div className="copy-block-top">
        <span>{language ?? "json"}</span>
        <button type="button" onClick={copy} aria-label="코드 복사">
          {copied ? "복사됨 ✓" : "복사"}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

export function SetupTabs() {
  const [tab, setTab] = useState<keyof typeof configs>("claude");

  return (
    <div className="setup-tabs">
      <div className="tab-list" role="tablist" aria-label="에이전트 선택">
        <button
          className={tab === "claude" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={tab === "claude"}
          onClick={() => setTab("claude")}
        >
          Claude Code
        </button>
        <button
          className={tab === "cursor" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={tab === "cursor"}
          onClick={() => setTab("cursor")}
        >
          Cursor
        </button>
      </div>
      <p className="tab-help">
        {tab === "claude"
          ? "프로젝트 루트의 .mcp.json에 아래 설정을 추가하세요."
          : "프로젝트의 .cursor/mcp.json 또는 전역 ~/.cursor/mcp.json에 추가하세요."}
      </p>
      <CopyBlock code={configs[tab]} />
      <p className="first-prompt">
        연결 후 이렇게 말해보세요: <b>“이 오류와 비슷한 해결 사례를 Context Hub에서 먼저 찾아줘.”</b>
      </p>
    </div>
  );
}
