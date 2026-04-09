/** Parse a unified diff patch string into individual diff lines. */
export interface DiffLine {
  type: "add" | "del" | "context" | "hunk";
  content: string;
  oldLine?: number;
  newLine?: number;
}

export function parsePatch(patch: string): DiffLine[] {
  if (!patch) return [];

  const lines = patch.split("\n");
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: "hunk", content: line });
    } else if (line.startsWith("+")) {
      result.push({ type: "add", content: line.slice(1), newLine });
      newLine++;
    } else if (line.startsWith("-")) {
      result.push({ type: "del", content: line.slice(1), oldLine });
      oldLine++;
    } else {
      // Context line (starts with space or is empty)
      const content = line.startsWith(" ") ? line.slice(1) : line;
      result.push({ type: "context", content, oldLine, newLine });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

/** Extract diff lines that overlap with a given new-file line range. */
export function extractDiffRange(
  lines: DiffLine[],
  startLine: number,
  endLine: number,
): DiffLine[] {
  return lines.filter((l) => {
    if (l.type === "hunk") return false;
    const lineNum = l.newLine ?? l.oldLine ?? 0;
    return lineNum >= startLine && lineNum <= endLine;
  });
}

/** Compute the gap (hidden lines) before a hunk header at the given index. */
export function computeGap(lines: DiffLine[], hunkIdx: number): {
  gapOldStart: number;
  gapOldEnd: number;
  gapNewStart: number;
  gapNewEnd: number;
  hiddenCount: number;
} | null {
  const hunk = lines[hunkIdx];
  if (hunk.type !== "hunk") return null;

  const match = hunk.content.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (!match) return null;

  const hunkOldStart = parseInt(match[1], 10);
  const hunkNewStart = parseInt(match[2], 10);

  // Find the last real line before this hunk.
  let prevOld = 0;
  let prevNew = 0;
  for (let i = hunkIdx - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.type === "hunk") continue;
    if (l.type !== "add" && l.oldLine != null) prevOld = l.oldLine;
    if (l.type !== "del" && l.newLine != null) prevNew = l.newLine;
    break;
  }

  const gapOldStart = prevOld + 1;
  const gapNewStart = prevNew + 1;
  const gapOldEnd = hunkOldStart - 1;
  const gapNewEnd = hunkNewStart - 1;
  const hiddenCount = gapNewEnd - gapNewStart + 1;

  if (hiddenCount <= 0) return null;

  return { gapOldStart, gapOldEnd, gapNewStart, gapNewEnd, hiddenCount };
}

/**
 * Expand hidden lines at a hunk boundary.
 *
 * @param lines     Current DiffLine array (may have been previously expanded).
 * @param hunkIdx   Index of the hunk header to expand at.
 * @param fileLines Full file content as an array of lines (from HEAD ref).
 * @param direction "up" = show lines from top of gap, "down" = from bottom, "all" = everything.
 * @param count     How many lines to reveal per expansion (default 20).
 * @returns         Updated DiffLine array with expanded context lines.
 */
export function expandDiffLines(
  lines: DiffLine[],
  hunkIdx: number,
  fileLines: string[],
  direction: "up" | "down" | "all",
  count: number = 20,
): DiffLine[] {
  const gap = computeGap(lines, hunkIdx);
  if (!gap) return lines;

  const { gapOldStart, gapNewStart, gapNewEnd } = gap;
  const oldNewOffset = gapOldStart - gapNewStart;

  let expandNewStart: number;
  let expandNewEnd: number;

  if (direction === "all") {
    expandNewStart = gapNewStart;
    expandNewEnd = gapNewEnd;
  } else if (direction === "down") {
    // Reveal lines from the bottom of the gap (just above the current hunk).
    expandNewEnd = gapNewEnd;
    expandNewStart = Math.max(gapNewStart, gapNewEnd - count + 1);
  } else {
    // Reveal lines from the top of the gap (just after previous content).
    expandNewStart = gapNewStart;
    expandNewEnd = Math.min(gapNewEnd, gapNewStart + count - 1);
  }

  // Build context lines from file content.
  const contextLines: DiffLine[] = [];
  for (let n = expandNewStart; n <= expandNewEnd; n++) {
    contextLines.push({
      type: "context",
      content: fileLines[n - 1] ?? "",
      oldLine: n + oldNewOffset,
      newLine: n,
    });
  }

  // Build replacement for the hunk header.
  const replacement: DiffLine[] = [];

  if (direction === "up") {
    // Expanded lines go first, then remaining hunk header (if gap remains).
    replacement.push(...contextLines);
    if (expandNewEnd < gapNewEnd) {
      // Keep the original hunk header — gap computation will find the reduced gap.
      replacement.push(lines[hunkIdx]);
    }
  } else if (direction === "down") {
    if (expandNewStart > gapNewStart) {
      // Remaining gap above — create a new hunk header.
      const remOld = expandNewStart + oldNewOffset;
      replacement.push({
        type: "hunk",
        content: `@@ -${remOld},0 +${expandNewStart},0 @@`,
      });
    }
    replacement.push(...contextLines);
  } else {
    // All — just context lines, no hunk header.
    replacement.push(...contextLines);
  }

  const result = [...lines];
  result.splice(hunkIdx, 1, ...replacement);
  return result;
}

/**
 * Compute how many trailing lines exist after the last diff line in the file.
 * Returns 0 if unknown or no trailing content.
 */
export function trailingLineCount(lines: DiffLine[], totalFileLines: number): number {
  let lastNew = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.type === "hunk") continue;
    if (l.newLine != null && l.type !== "del") {
      lastNew = l.newLine;
      break;
    }
  }
  return Math.max(0, totalFileLines - lastNew);
}

/**
 * Append trailing context lines after the last diff line.
 */
export function expandTrailingLines(
  lines: DiffLine[],
  fileLines: string[],
  count: number = 20,
): DiffLine[] {
  // Find the last line numbers in the diff.
  let lastOld = 0;
  let lastNew = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.type === "hunk") continue;
    if (l.type !== "add" && l.oldLine != null && lastOld === 0) lastOld = l.oldLine;
    if (l.type !== "del" && l.newLine != null && lastNew === 0) lastNew = l.newLine;
    if (lastOld > 0 && lastNew > 0) break;
  }

  const totalLines = fileLines.length;
  if (lastNew >= totalLines) return lines;

  const startNew = lastNew + 1;
  const endNew = Math.min(totalLines, lastNew + count);
  const offset = lastOld - lastNew;

  const extra: DiffLine[] = [];
  for (let n = startNew; n <= endNew; n++) {
    extra.push({
      type: "context",
      content: fileLines[n - 1] ?? "",
      oldLine: n + offset,
      newLine: n,
    });
  }

  return [...lines, ...extra];
}
