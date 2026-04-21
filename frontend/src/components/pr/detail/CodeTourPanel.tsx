import React, { useState, useCallback, useMemo } from "react";
import {
  Map as MapIcon,
  Loader2,
  XCircle,
  ChevronDown,
  ChevronUp,
  UnfoldVertical,
  Send,
  Check,
  FileText,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { mdComponents } from "@/lib/markdownComponents";
import {
  parsePatch,
  extractDiffRange,
  computeGap,
  expandDiffLines,
  trailingLineCount,
  expandTrailingLines,
} from "@/lib/diffUtils";
import type { DiffLine } from "@/lib/diffUtils";
import { langFromFilename, highlightLine } from "@/lib/highlighter";
import type { CodeTourData } from "@/types/codeTour";
import type { github } from "../../../../wailsjs/go/models";
import { GetFileContent, AddPRComment } from "../../../../wailsjs/go/services/PullRequestService";
import { AppendCodeTourToDescription } from "../../../../wailsjs/go/services/WorkspaceService";
import { InlineThreadDisplay, AddCommentButton, CommentForm } from "../InlineComment";

/** Build a GitHub blob URL that renders as an embedded code snippet in comments. */
function githubBlobUrl(repoOwner: string, repoName: string, commitSha: string, filePath: string, startLine?: number, endLine?: number): string {
  let url = `https://github.com/${repoOwner}/${repoName}/blob/${commitSha}/${filePath}`;
  if (startLine) {
    url += `#L${startLine}`;
    if (endLine && endLine !== startLine) url += `-L${endLine}`;
  }
  return url;
}

/** Convert a code tour to a markdown string suitable for posting as a PR comment. */
function tourToMarkdown(tour: CodeTourData, repoOwner?: string, repoName?: string, commitSha?: string): string {
  const lines: string[] = [];
  lines.push(`## 🗺️ Code Tour: ${tour.title}`);
  lines.push("");

  if (tour.summary) {
    lines.push(tour.summary);
    lines.push("");
  }

  const canLink = !!repoOwner && !!repoName && !!commitSha;

  for (let i = 0; i < tour.steps.length; i++) {
    const step = tour.steps[i];
    lines.push(`### Step ${i + 1}: ${step.title}`);
    lines.push("");
    lines.push(step.description);
    if (step.file) {
      lines.push("");
      if (canLink) {
        const url = githubBlobUrl(repoOwner, repoName, commitSha, step.file, step.startLine, step.endLine);
        lines.push(url);
      } else {
        lines.push(`📄 \`${step.file}\``);
      }
    }
    lines.push("");
    if (i < tour.steps.length - 1) lines.push("---");
    if (i < tour.steps.length - 1) lines.push("");
  }

  return lines.join("\n");
}

const EXPAND_COUNT = 20;

function StepDiffSnippet({
  file,
  startLine,
  endLine,
  prFiles,
  owner,
  repo,
  headRef,
  prNodeId,
  reviewThreads,
  onToggleResolved,
  onCommentAdded,
}: {
  file: string;
  startLine: number;
  endLine: number;
  prFiles: github.PRFile[];
  owner?: string;
  repo?: string;
  headRef?: string;
  prNodeId?: string;
  reviewThreads?: github.ReviewThread[];
  onToggleResolved?: (threadId: string, resolved: boolean) => void;
  onCommentAdded?: () => void;
}) {
  const matchedFile = prFiles.find(
    (f) => f.filename === file || f.filename.endsWith("/" + file),
  );
  if (!matchedFile?.patch) return null;

  const allLines = parsePatch(matchedFile.patch);
  const initialSnippet = extractDiffRange(allLines, startLine, endLine);
  if (initialSnippet.length === 0) return null;

  const [lines, setLines] = useState<DiffLine[]>(() => {
    // Build a proper line array with a leading hunk header so expansion works.
    // Find the hunk that contains our range and include it.
    const result: DiffLine[] = [];
    let inRange = false;
    let lastHunk: DiffLine | null = null;

    for (const line of allLines) {
      if (line.type === "hunk") {
        lastHunk = line;
        continue;
      }
      const lineNum = line.newLine ?? line.oldLine ?? 0;
      if (lineNum >= startLine && lineNum <= endLine) {
        if (!inRange && lastHunk) {
          result.push(lastHunk);
          inRange = true;
        }
        result.push(line);
      } else if (inRange && lineNum > endLine) {
        break;
      }
    }
    return result;
  });

  const [fileContent, setFileContent] = useState<string[] | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [commentLine, setCommentLine] = useState<number | null>(null);

  const canExpand = !!owner && !!repo && !!headRef && matchedFile.status !== "removed";
  const canComment = !!prNodeId;

  const lang = langFromFilename(file);

  // Build a map of newLine -> threads for this file.
  const threadsByLine = useMemo(() => {
    const map = new Map<number, github.ReviewThread[]>();
    if (!reviewThreads) return map;
    for (const t of reviewThreads) {
      if (t.path === matchedFile.filename || t.path === file) {
        const existing = map.get(t.line) || [];
        existing.push(t);
        map.set(t.line, existing);
      }
    }
    return map;
  }, [reviewThreads, matchedFile.filename, file]);

  const fetchContent = useCallback(async (): Promise<string[] | null> => {
    if (fileContent) return fileContent;
    if (!owner || !repo || !headRef) return null;
    setLoadingContent(true);
    try {
      const raw = await GetFileContent(owner, repo, matchedFile!.filename, headRef);
      const contentLines = raw.split("\n");
      setFileContent(contentLines);
      return contentLines;
    } catch {
      return null;
    } finally {
      setLoadingContent(false);
    }
  }, [fileContent, owner, repo, headRef, matchedFile]);

  const handleExpand = useCallback(
    async (hunkIdx: number, direction: "up" | "down" | "all") => {
      const content = await fetchContent();
      if (!content) return;
      setLines((prev) => expandDiffLines(prev, hunkIdx, content, direction, EXPAND_COUNT));
    },
    [fetchContent],
  );

  const handleExpandTrailing = useCallback(async () => {
    const content = await fetchContent();
    if (!content) return;
    setLines((prev) => expandTrailingLines(prev, content, EXPAND_COUNT));
  }, [fetchContent]);

  const trailing = fileContent ? trailingLineCount(lines, fileContent.length) : 0;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {file}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse font-mono text-xs">
          <tbody>
            {lines.map((line, i) => {
              if (line.type === "hunk") {
                const gap = computeGap(lines, i);
                if (!gap || !canExpand) return null;

                if (gap.hiddenCount <= EXPAND_COUNT * 2) {
                  return (
                    <tr key={i} className="bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
                      <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
                      <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
                      <td className="w-[1px] select-none border-r border-border/30 px-1 py-0.5" />
                      <td className="px-3 py-1">
                        <button
                          onClick={() => handleExpand(i, "all")}
                          className="flex w-full items-center justify-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                        >
                          <UnfoldVertical className="h-3 w-3" />
                          Show {gap.hiddenCount} hidden line{gap.hiddenCount !== 1 ? "s" : ""}
                        </button>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={i} className="bg-blue-500/5">
                    <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
                    <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
                    <td className="w-[1px] select-none border-r border-border/30 px-1 py-0.5" />
                    <td className="px-3 py-1">
                      <div className="flex items-center justify-center gap-4 text-xs">
                        <button
                          onClick={() => handleExpand(i, "up")}
                          className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                          <ChevronDown className="h-3 w-3" />
                          Expand {EXPAND_COUNT} lines
                        </button>
                        <button
                          onClick={() => handleExpand(i, "all")}
                          className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                          <UnfoldVertical className="h-3 w-3" />
                          Show all {gap.hiddenCount}
                        </button>
                        <button
                          onClick={() => handleExpand(i, "down")}
                          className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                          <ChevronUp className="h-3 w-3" />
                          Expand {EXPAND_COUNT} lines
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              const newLineNum = line.newLine;
              const lineThreads = newLineNum != null ? threadsByLine.get(newLineNum) : undefined;
              const showCommentForm = commentLine === newLineNum && newLineNum != null;

              return (
                <React.Fragment key={i}>
                  <tr
                    className={`group ${
                      line.type === "add"
                        ? "bg-green-50 dark:bg-green-950/30"
                        : line.type === "del"
                          ? "bg-red-50 dark:bg-red-950/30"
                          : ""
                    }`}
                  >
                    <td className="w-10 select-none whitespace-nowrap border-r border-border/30 px-2 py-0 text-right text-muted-foreground/50">
                      {line.oldLine ?? ""}
                    </td>
                    <td className="w-10 select-none whitespace-nowrap border-r border-border/30 px-2 py-0 text-right text-muted-foreground/50">
                      {line.newLine ?? ""}
                    </td>
                    <td className="w-[1px] select-none border-r border-border/30 px-1 py-0 text-center text-muted-foreground/50">
                      {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                    </td>
                    <td className="whitespace-pre px-2 py-0 relative">
                      <span dangerouslySetInnerHTML={{ __html: highlightLine(line.content, lang) }} />
                      {canComment && line.type !== "del" && newLineNum != null && (
                        <AddCommentButton onClick={() => setCommentLine(showCommentForm ? null : newLineNum)} />
                      )}
                    </td>
                  </tr>
                  {/* Existing review threads on this line */}
                  {lineThreads?.map((thread) => (
                    <tr key={`thread-${thread.id}`}>
                      <td className="w-10 border-r border-border/30" />
                      <td className="w-10 border-r border-border/30" />
                      <td className="w-[1px] border-r border-border/30" />
                      <td>
                        <InlineThreadDisplay thread={thread} onToggleResolved={onToggleResolved} onReplied={onCommentAdded} />
                      </td>
                    </tr>
                  ))}
                  {/* New comment form */}
                  {showCommentForm && prNodeId && (
                    <tr>
                      <td className="w-10 border-r border-border/30" />
                      <td className="w-10 border-r border-border/30" />
                      <td className="w-[1px] border-r border-border/30" />
                      <td>
                        <CommentForm
                          prNodeId={prNodeId}
                          filePath={matchedFile!.filename}
                          line={newLineNum}
                          onClose={() => setCommentLine(null)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Expand to end of file */}
            {canExpand && trailing > 0 && (
              <tr className="bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
                <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
                <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
                <td className="w-[1px] select-none border-r border-border/30 px-1 py-0.5" />
                <td className="px-3 py-1">
                  <button
                    onClick={handleExpandTrailing}
                    className="flex w-full items-center justify-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    <ChevronDown className="h-3 w-3" />
                    Show {Math.min(trailing, EXPAND_COUNT)} more line
                    {Math.min(trailing, EXPAND_COUNT) !== 1 ? "s" : ""}
                    {trailing > EXPAND_COUNT && ` of ${trailing}`}
                  </button>
                </td>
              </tr>
            )}

            {loadingContent && (
              <tr>
                <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
                <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
                <td className="w-[1px] select-none border-r border-border/30 px-1 py-0.5" />
                <td className="px-3 py-2 text-center">
                  <Loader2 className="inline h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CodeTourPanel({
  generating,
  tour,
  error,
  cost,
  duration,
  hasLocalPath,
  hasTools,
  prFiles,
  owner,
  repo,
  headRef,
  prNodeId,
  prNumber,
  headRefOid,
  reviewThreads,
  onToggleResolved,
  onCommentAdded,
  onDescriptionUpdated,
  onStart,
  onCancel,
}: {
  generating: boolean;
  tour: CodeTourData | null;
  error: string | null;
  cost: number;
  duration: number;
  hasLocalPath: boolean;
  hasTools: boolean;
  prFiles: github.PRFile[] | null;
  owner?: string;
  repo?: string;
  headRef?: string;
  prNodeId?: string;
  prNumber?: number;
  headRefOid?: string;
  reviewThreads?: github.ReviewThread[];
  onToggleResolved?: (threadId: string, resolved: boolean) => void;
  onCommentAdded?: () => void;
  onDescriptionUpdated?: () => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [updatingDesc, setUpdatingDesc] = useState(false);
  const [descUpdated, setDescUpdated] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);

  const handlePostToPR = useCallback(async () => {
    if (!tour || !prNodeId) return;
    setPosting(true);
    try {
      const md = tourToMarkdown(tour, owner, repo, headRefOid);
      await AddPRComment(prNodeId, md);
      setPosted(true);
      setTimeout(() => setPosted(false), 3000);
    } catch {
      // User can retry
    } finally {
      setPosting(false);
    }
  }, [tour, prNodeId, owner, repo, headRefOid]);

  const handleUpdateDescription = useCallback(async () => {
    if (!tour || !owner || !repo || !prNumber) return;
    setUpdatingDesc(true);
    setDescError(null);
    try {
      const md = tourToMarkdown(tour, owner, repo, headRefOid);
      await AppendCodeTourToDescription(owner, repo, prNumber, md);
      setDescUpdated(true);
      setTimeout(() => setDescUpdated(false), 3000);
      onDescriptionUpdated?.();
    } catch (err) {
      setDescError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingDesc(false);
    }
  }, [tour, owner, repo, prNumber, headRefOid, onDescriptionUpdated]);

  if (!hasLocalPath) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12">
        <MapIcon className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          This repository does not have a local path configured.
        </p>
        <p className="text-xs text-muted-foreground">
          Add the local clone path in Settings to enable code tours.
        </p>
      </div>
    );
  }

  if (!hasTools) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12">
        <MapIcon className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Required CLI tools are not installed.
        </p>
        <p className="text-xs text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5 text-xs">gh</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">claude</code> CLI must be installed and on PATH.
        </p>
      </div>
    );
  }

  // Idle state
  if (!generating && !tour && !error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-12">
        <MapIcon className="h-10 w-10 text-purple-500/60" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Code Tour</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Generate an AI-guided walkthrough of this pull request.
          </p>
        </div>
        <button
          onClick={onStart}
          className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          <MapIcon className="h-4 w-4" />
          Generate Code Tour
        </button>
      </div>
    );
  }

  // Loading state
  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Generating tour...</p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI is creating a guided walkthrough. This may take a few minutes.
          </p>
        </div>
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <XCircle className="h-4 w-4" />
          Cancel
        </button>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          Tour generation failed: {error}
        </div>
        <button
          onClick={onStart}
          className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          <MapIcon className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  // Result state — continuous flow of all steps
  if (!tour) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-purple-500" />
          <h3 className="text-sm font-semibold text-foreground">{tour.title}</h3>
        </div>
        <div className="flex items-center gap-3">
          {cost > 0 && (
            <span className="text-xs text-muted-foreground">
              ${cost.toFixed(4)}
            </span>
          )}
          {duration > 0 && (
            <span className="text-xs text-muted-foreground">
              {duration < 60
                ? `${Math.round(duration)}s`
                : `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`}
            </span>
          )}
          <button
            onClick={handlePostToPR}
            disabled={posting || posted}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="Post this code tour as a comment on the PR"
          >
            {posting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : posted ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {posted ? "Posted" : "Post to PR"}
          </button>
          <button
            onClick={handleUpdateDescription}
            disabled={updatingDesc || descUpdated || !prNumber}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="Append this code tour to the PR description (replaces any previous tour block)"
          >
            {updatingDesc ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : descUpdated ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {descUpdated ? "Updated" : "Update description"}
          </button>
        </div>
      </div>
      {descError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          Failed to update description: {descError}
        </div>
      )}

      {/* Summary */}
      {tour.summary && (
        <div className="prose dark:prose-invert prose-sm max-w-none font-sans text-[14px] rounded-lg border border-border bg-card p-4 prose-p:text-muted-foreground prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
            {tour.summary}
          </ReactMarkdown>
        </div>
      )}

      {/* All steps */}
      {tour.steps.map((step, idx) => (
        <section
          key={idx}
          id={`tour-step-${idx}`}
          className="space-y-3 scroll-mt-4"
        >
          {/* Step number + title */}
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-medium text-white">
              {idx + 1}
            </span>
            <h4 className="text-base font-semibold text-foreground">{step.title}</h4>
          </div>

          {/* File reference badge */}
          {step.file && (
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                {step.file}
              </code>
              {step.startLine && step.endLine && (
                <span className="text-xs text-muted-foreground">
                  L{step.startLine}–{step.endLine}
                </span>
              )}
              {step.changeType && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    step.changeType === "added"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : step.changeType === "removed"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                        : step.changeType === "modified"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
                          : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step.changeType}
                </span>
              )}
            </div>
          )}

          {/* Step description (markdown) */}
          <div className="prose dark:prose-invert prose-sm max-w-none font-sans text-[14px] rounded-lg border border-border bg-card p-4 prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-li:text-muted-foreground prose-th:text-foreground prose-td:text-muted-foreground prose-thead:border-border prose-tr:border-border">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
              {step.description}
            </ReactMarkdown>
          </div>

          {/* Inline diff snippet */}
          {step.file && step.startLine && step.endLine && prFiles && (
            <StepDiffSnippet
              file={step.file}
              startLine={step.startLine}
              endLine={step.endLine}
              prFiles={prFiles}
              owner={owner}
              repo={repo}
              headRef={headRef}
              prNodeId={prNodeId}
              reviewThreads={reviewThreads}
              onToggleResolved={onToggleResolved}
              onCommentAdded={onCommentAdded}
            />
          )}

          {/* Separator between steps (not after last) */}
          {idx < tour.steps.length - 1 && (
            <div className="border-b border-border" />
          )}
        </section>
      ))}
    </div>
  );
}
