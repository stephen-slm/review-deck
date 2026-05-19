/**
 * Lightweight ring-buffer debug logger.
 *
 * Records the last N log entries with high-resolution timestamps.
 * The ErrorBoundary captures the buffer at crash time so it can be
 * included in the "Copy full report" output.
 *
 * Zero overhead when not read — all entries are plain string concat.
 */

const MAX_ENTRIES = 500;

export type LogLevel = "debug" | "warn" | "error";

export interface Entry {
  ts: number;
  tag: string;
  detail: string;
  level: LogLevel;
}

const _buf: Entry[] = [];
let _seq = 0;
type Listener = () => void;
const _listeners = new Set<Listener>();

function _push(tag: string, detail: string, level: LogLevel): void {
  _buf.push({ ts: performance.now(), tag, detail, level });
  if (_buf.length > MAX_ENTRIES) _buf.shift();
  _seq++;
  for (const fn of _listeners) fn();
}

/** Append a debug log entry. */
export function dlog(tag: string, detail: string): void {
  _push(tag, detail, "debug");
}

/** Return a shallow copy of the buffer for rendering. */
export function getDebugEntries(): Entry[] {
  return _buf.slice();
}

/** Subscribe to new entries — returns an unsubscribe function. */
export function onDebugEntry(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Format the entire buffer as a human-readable string. */
export function formatDebugLog(): string {
  if (_buf.length === 0) return "(empty debug log)";
  const lines = _buf.map(
    (e, i) => `[${e.ts.toFixed(1).padStart(10)}ms] #${(_seq - _buf.length + i + 1).toString().padStart(4)} ${e.tag}: ${e.detail}`,
  );
  return lines.join("\n");
}

/** Return the raw entry count (total since page load, not just buffer). */
export function debugLogSeq(): number {
  return _seq;
}

// Intercept console.warn and console.error so they appear in the debug panel.
const _origWarn = console.warn;
const _origError = console.error;

console.warn = (...args: unknown[]) => {
  _push("console.warn", args.map(String).join(" "), "warn");
  _origWarn.apply(console, args);
};

console.error = (...args: unknown[]) => {
  _push("console.error", args.map(String).join(" "), "error");
  _origError.apply(console, args);
};

window.addEventListener("unhandledrejection", (e) => {
  _push("unhandledrejection", String(e.reason), "error");
});
