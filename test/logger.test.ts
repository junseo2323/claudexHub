import { describe, it, expect } from "vitest";
import { formatLog, newRequestId } from "../src/logger.js";

describe("logger", () => {
  it("formatLog emits parseable JSON with level, event, ts and fields", () => {
    const line = formatLog("info", "api.search", { reqId: "r1", status: 200, ms: 12 });
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("api.search");
    expect(parsed.reqId).toBe("r1");
    expect(parsed.status).toBe(200);
    expect(typeof parsed.ts).toBe("string");
    expect(Number.isNaN(Date.parse(parsed.ts as string))).toBe(false);
  });

  it("newRequestId returns unique uuid-like ids", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
