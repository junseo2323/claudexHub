import { randomUUID } from "node:crypto";

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

/** A fresh request/correlation id. */
export function newRequestId(): string {
  return randomUUID();
}

/** Render a structured (JSON) log line. Pure — used by logEvent and tested directly. */
export function formatLog(level: LogLevel, event: string, fields: LogFields = {}): string {
  return JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
}

/**
 * Emit a structured log line to stderr. stdout is reserved for the MCP stdio
 * protocol, so all logs go to stderr regardless of surface.
 */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  // eslint-disable-next-line no-console
  console.error(formatLog(level, event, fields));
}
