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
