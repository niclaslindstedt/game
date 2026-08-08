// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Central output module (OSS_SPEC §19.4). All diagnostic output from the
// engine and the app routes through the semantic helpers below so formatting
// and routing can change in one place. Raw `console.*` calls are forbidden
// outside this module (enforced by the `no-console` ESLint rule).
//
// Browser adaptation of §19: instead of a log *file*, every message — all
// levels, including debug — is appended to an in-memory ring buffer that the
// app can surface in a developer overlay or attach to a bug report
// (`recentLogs()`). Debug messages only reach the console when debug mode is
// switched on (§19.3's `--debug` equivalent), either via `setDebugEnabled`
// or by loading the app with `?debug` in the URL.

export type LogLevel = "error" | "warn" | "info" | "debug";

export type LogEntry = {
  time: string;
  level: LogLevel;
  message: string;
};

const MAX_BUFFERED_ENTRIES = 500;
const buffer: LogEntry[] = [];

let debugEnabled =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("debug");

/** Toggle debug-level console output at runtime (§19.3). */
export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

/** The most recent log entries, oldest first — all levels, always on (§19.2). */
export function recentLogs(): readonly LogEntry[] {
  return buffer;
}

function record(level: LogLevel, message: string): void {
  buffer.push({ time: new Date().toISOString(), level, message });
  if (buffer.length > MAX_BUFFERED_ENTRIES) buffer.shift();
}

/** Success messages. */
export function status(message: string): void {
  record("info", message);
  console.info(`✓ ${message}`);
}

/** Recoverable issues the player or developer should know about. */
export function warn(message: string): void {
  record("warn", message);
  console.warn(`! ${message}`);
}

/** Normal operational messages (status, progress). */
export function info(message: string): void {
  record("info", message);
  console.info(message);
}

/** Bold section headers for grouped diagnostics. */
export function header(message: string): void {
  record("info", message);
  console.info(`== ${message} ==`);
}

/** Unrecoverable failures. */
export function error(message: string): void {
  record("error", message);
  console.error(`✗ ${message}`);
}

/** Verbose diagnostics — buffered always, printed only in debug mode. */
export function debug(message: string): void {
  record("debug", message);
  if (debugEnabled) console.debug(message);
}
