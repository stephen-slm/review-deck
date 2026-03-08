/**
 * Lightweight ring-buffer debug logger.
 *
 * Records the last N log entries with high-resolution timestamps.
 * The ErrorBoundary captures the buffer at crash time so it can be
 * included in the "Copy full report" output.
 *
 * Zero overhead when not read — all entries are plain string concat.
 */

const MAX_ENTRIES = 200;

interface Entry {
  /** Milliseconds since page load (performance.now). */
  ts: number;
  tag: string;
  detail: string;
}

const _buf: Entry[] = [];
let _seq = 0;

/** Append a debug log entry. */
export function dlog(tag: string, detail: string): void {
  _buf.push({ ts: performance.now(), tag, detail });
  if (_buf.length > MAX_ENTRIES) _buf.shift();
  _seq++;
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
