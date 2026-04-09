import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
import {
  FileCode,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  AlertTriangle,
  File,
  FilePlus,
  FileX,
  ArrowRight,
  UnfoldVertical,
} from "lucide-react";
import { github } from "../../../wailsjs/go/models";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import { GetFileContent } from "../../../wailsjs/go/services/PullRequestService";
import { useVimStore } from "@/stores/vimStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { parsePatch, computeGap, expandDiffLines, trailingLineCount, expandTrailingLines } from "@/lib/diffUtils";
import type { DiffLine } from "@/lib/diffUtils";
import { langFromFilename, highlightLine } from "@/lib/highlighter";
import { InlineThreadDisplay, AddCommentButton, CommentForm } from "./InlineComment";

interface DiffViewProps {
  files: github.PRFile[] | null;
  loading: boolean;
  error: string | null;
  /** Owner and repo for "Open in GoLand" per-file buttons */
  owner?: string;
  repo?: string;
  /** PR head branch name — used to fetch file content for diff expansion. */
  headRef?: string;
  /** PR node ID — used for creating review comments. */
  prNodeId?: string;
  /** Review threads to display inline on diff lines. */
  reviewThreads?: github.ReviewThread[];
  /** Callback when a thread's resolved state is toggled. */
  onToggleResolved?: (threadId: string, resolved: boolean) => void;
  /** Ref populated with a function to toggle expand/collapse of the currently selected file. */
  toggleSelectedRef?: React.MutableRefObject<(() => void) | null>;
  /** Controlled expanded files state — lifted to parent to persist across tab switches. */
  expandedFiles: Set<string>;
  onExpandedFilesChange: (files: Set<string>) => void;
  /** Called after a reply is posted to a thread — parent should refresh comments. */
  onCommentAdded?: () => void;
}

function FileStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "added":
      return <FilePlus className="h-3.5 w-3.5 text-green-600 dark:text-green-300" />;
    case "removed":
      return <FileX className="h-3.5 w-3.5 text-red-600 dark:text-red-300" />;
    case "renamed":
      return <ArrowRight className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />;
    default:
      return <File className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function FileStatsBadge({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {additions > 0 && (
        <span className="text-green-600 dark:text-green-300">+{additions}</span>
      )}
      {deletions > 0 && (
        <span className="text-red-600 dark:text-red-300">-{deletions}</span>
      )}
    </span>
  );
}

const EXPAND_COUNT = 20;

/** Row that allows expanding hidden lines at a hunk boundary. */
function ExpandRow({ gap, onExpand }: {
  gap: { hiddenCount: number };
  onExpand: (direction: "up" | "down" | "all") => void;
}) {
  const { hiddenCount } = gap;

  if (hiddenCount <= EXPAND_COUNT * 2) {
    return (
      <tr className="bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
        <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
        <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
        <td className="px-3 py-1">
          <button
            onClick={() => onExpand("all")}
            className="flex w-full items-center justify-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            <UnfoldVertical className="h-3 w-3" />
            Show {hiddenCount} hidden line{hiddenCount !== 1 ? "s" : ""}
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-blue-500/5">
      <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
      <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
      <td className="px-3 py-1">
        <div className="flex items-center justify-center gap-4 text-xs">
          <button
            onClick={() => onExpand("up")}
            className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
            Expand {EXPAND_COUNT} lines
          </button>
          <button
            onClick={() => onExpand("all")}
            className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            <UnfoldVertical className="h-3 w-3" />
            Show all {hiddenCount}
          </button>
          <button
            onClick={() => onExpand("down")}
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

/** Renders a single file's diff with expandable context. */
function FileDiff({ file, isExpanded, onToggle, isSelected, onOpenInGoLand, owner, repo, headRef, prNodeId, fileThreads, onToggleResolved, onCommentAdded }: {
  file: github.PRFile;
  isExpanded: boolean;
  onToggle: () => void;
  isSelected: boolean;
  onOpenInGoLand?: (filePath: string) => void;
  owner?: string;
  repo?: string;
  headRef?: string;
  prNodeId?: string;
  fileThreads?: github.ReviewThread[];
  onToggleResolved?: (threadId: string, resolved: boolean) => void;
  onCommentAdded?: () => void;
}) {
  const initialLines = useMemo(() => parsePatch(file.patch), [file.patch]);
  const [lines, setLines] = useState<DiffLine[]>(initialLines);
  const [fileContent, setFileContent] = useState<string[] | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const lang = useMemo(() => langFromFilename(file.filename), [file.filename]);

  // Reset lines when the patch changes (e.g. PR refresh).
  useEffect(() => {
    setLines(initialLines);
    setFileContent(null);
  }, [initialLines]);

  const [commentLine, setCommentLine] = useState<number | null>(null);
  const canExpand = !!owner && !!repo && !!headRef && file.status !== "removed";
  const canComment = !!prNodeId;

  // Build a map of newLine -> threads for this file.
  const threadsByLine = useMemo(() => {
    const map = new Map<number, github.ReviewThread[]>();
    if (!fileThreads) return map;
    for (const t of fileThreads) {
      const existing = map.get(t.line) || [];
      existing.push(t);
      map.set(t.line, existing);
    }
    return map;
  }, [fileThreads]);

  const fetchContent = useCallback(async (): Promise<string[] | null> => {
    if (fileContent) return fileContent;
    if (!owner || !repo || !headRef) return null;
    setLoadingContent(true);
    try {
      const raw = await GetFileContent(owner, repo, file.filename, headRef);
      const contentLines = raw.split("\n");
      setFileContent(contentLines);
      return contentLines;
    } catch {
      return null;
    } finally {
      setLoadingContent(false);
    }
  }, [fileContent, owner, repo, headRef, file.filename]);

  const handleExpand = useCallback(async (hunkIdx: number, direction: "up" | "down" | "all") => {
    const content = await fetchContent();
    if (!content) return;
    setLines((prev) => expandDiffLines(prev, hunkIdx, content, direction, EXPAND_COUNT));
  }, [fetchContent]);

  const handleExpandTrailing = useCallback(async () => {
    const content = await fetchContent();
    if (!content) return;
    setLines((prev) => expandTrailingLines(prev, content, EXPAND_COUNT));
  }, [fetchContent]);

  // Compute trailing line count (for "expand to end of file" button).
  const trailing = fileContent ? trailingLineCount(lines, fileContent.length) : 0;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isSelected
          ? "ring-1 ring-primary border-primary/50"
          : "border-border"
      }`}
    >
      {/* File header */}
      <div className="flex items-center gap-2 rounded-t-lg bg-muted/50 px-3 py-2">
        <button
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:opacity-80"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <FileStatusIcon status={file.status} />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
            {file.previousFilename && file.status === "renamed" ? (
              <>
                <span className="text-muted-foreground">{file.previousFilename}</span>
                <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
                {file.filename}
              </>
            ) : (
              file.filename
            )}
          </span>
          <FileStatsBadge additions={file.additions} deletions={file.deletions} />
        </button>
        {onOpenInGoLand && file.status !== "removed" && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenInGoLand(file.filename); }}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={`Open ${file.filename} in GoLand`}
          >
            <FileCode className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Diff content */}
      {isExpanded && (
        <div className="border-t border-border">
          {lines.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground italic">
              {file.status === "renamed" ? "File renamed without changes" : "Binary file or no diff available"}
            </div>
          ) : (
            <table className="w-full table-fixed border-collapse font-mono text-xs">
              <tbody>
                {lines.map((line, i) => {
                  if (line.type === "hunk") {
                    const gap = computeGap(lines, i);
                    if (gap && canExpand) {
                      return (
                        <ExpandRow
                          key={i}
                          gap={gap}
                          onExpand={(dir) => handleExpand(i, dir)}
                        />
                      );
                    }
                    // Fallback: non-expandable hunk header
                    return (
                      <tr key={i} className="bg-blue-500/10">
                        <td className="w-10 select-none px-2 py-0.5 text-right text-blue-500/70 dark:text-blue-400/70">...</td>
                        <td className="w-10 select-none px-2 py-0.5 text-right text-blue-500/70 dark:text-blue-400/70">...</td>
                        <td className="px-3 py-0.5 text-blue-600 dark:text-blue-300">{line.content}</td>
                      </tr>
                    );
                  }

                  const bgClass =
                    line.type === "add"
                      ? "bg-green-500/10"
                      : line.type === "del"
                        ? "bg-red-500/10"
                        : "";

                  const textClass =
                    line.type === "add"
                      ? "text-green-700 dark:text-green-300"
                      : line.type === "del"
                        ? "text-red-700 dark:text-red-300"
                        : "text-foreground/80";

                  const lineNumClass =
                    line.type === "add"
                      ? "text-green-600/50 dark:text-green-400/50"
                      : line.type === "del"
                        ? "text-red-600/50 dark:text-red-400/50"
                        : "text-muted-foreground/50";

                  const newLineNum = line.newLine;
                  const lineThreads = newLineNum != null ? threadsByLine.get(newLineNum) : undefined;
                  const showCommentForm = commentLine === newLineNum && newLineNum != null;

                  return (
                    <React.Fragment key={i}>
                      <tr className={`group ${bgClass}`}>
                        <td className={`w-10 select-none border-r border-border/30 px-2 py-0.5 text-right ${lineNumClass}`}>
                          {line.type !== "add" ? line.oldLine : ""}
                        </td>
                        <td className={`w-10 select-none border-r border-border/30 px-2 py-0.5 text-right ${lineNumClass}`}>
                          {line.type !== "del" ? line.newLine : ""}
                        </td>
                        <td className={`whitespace-pre-wrap break-words px-3 py-0.5 relative ${textClass}`}>
                          <span className="mr-1 select-none opacity-50">
                            {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                          </span>
                          <span dangerouslySetInnerHTML={{ __html: highlightLine(line.content, lang) }} />
                          {canComment && line.type !== "del" && newLineNum != null && (
                            <AddCommentButton onClick={() => {
                              setCommentLine(showCommentForm ? null : newLineNum);
                            }} />
                          )}
                        </td>
                      </tr>
                      {/* Existing review threads on this line */}
                      {lineThreads?.map((thread) => (
                        <tr key={`thread-${thread.id}`}>
                          <td className="w-10 border-r border-border/30" />
                          <td className="w-10 border-r border-border/30" />
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
                          <td>
                            <CommentForm
                              prNodeId={prNodeId}
                              filePath={file.filename}
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
                    <td className="px-3 py-1">
                      <button
                        onClick={handleExpandTrailing}
                        className="flex w-full items-center justify-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        <ChevronDown className="h-3 w-3" />
                        Show {Math.min(trailing, EXPAND_COUNT)} more line{Math.min(trailing, EXPAND_COUNT) !== 1 ? "s" : ""}
                        {trailing > EXPAND_COUNT && ` of ${trailing}`}
                      </button>
                    </td>
                  </tr>
                )}
                {loadingContent && (
                  <tr>
                    <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
                    <td className="w-10 select-none px-2 py-0.5 border-r border-border/30" />
                    <td className="px-3 py-2 text-center">
                      <Loader2 className="inline h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function DiffView({ files, loading, error, owner, repo, headRef, prNodeId, reviewThreads, onToggleResolved, toggleSelectedRef, expandedFiles, onExpandedFilesChange, onCommentAdded }: DiffViewProps) {
  const selectedIndex = useVimStore((s) => s.selectedIndex);
  const sourceBasePath = useSettingsStore((s) => s.sourceBasePath);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleOpenInGoLand = sourceBasePath && owner && repo
    ? (filePath: string) => {
        const project = repo;
        const url = `jetbrains://goland/navigate/reference?project=${encodeURIComponent(project)}&path=${encodeURIComponent(filePath)}`;
        BrowserOpenURL(url);
      }
    : undefined;

  // Auto-expand all files on first load.
  useEffect(() => {
    if (files && files.length > 0 && expandedFiles.size === 0) {
      // Auto-expand up to 20 files; collapse the rest for performance.
      const initial = new Set(files.slice(0, 20).map((f) => f.filename));
      onExpandedFilesChange(initial);
    }
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update vim store list length.
  useEffect(() => {
    useVimStore.getState().setListLength(files?.length ?? 0);
  }, [files?.length]);

  // Auto-scroll selected file into view.
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  const toggleFile = (filename: string) => {
    const next = new Set(expandedFiles);
    if (next.has(filename)) {
      next.delete(filename);
    } else {
      next.add(filename);
    }
    onExpandedFilesChange(next);
  };

  // Expose a function to toggle the currently selected file via ref.
  useEffect(() => {
    if (toggleSelectedRef) {
      toggleSelectedRef.current = () => {
        if (files && selectedIndex >= 0 && selectedIndex < files.length) {
          toggleFile(files[selectedIndex].filename);
        }
      };
      return () => { toggleSelectedRef.current = null; };
    }
  }); // no deps — keeps closure fresh

  const expandAll = () => {
    if (files) onExpandedFilesChange(new Set(files.map((f) => f.filename)));
  };

  const collapseAll = () => {
    onExpandedFilesChange(new Set());
  };

  // Summary stats.
  const totalAdditions = useMemo(() => files?.reduce((s, f) => s + f.additions, 0) ?? 0, [files]);
  const totalDeletions = useMemo(() => files?.reduce((s, f) => s + f.deletions, 0) ?? 0, [files]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading files...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
        <AlertTriangle className="mr-1.5 inline h-4 w-4" />
        Failed to load files: {error}
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm italic text-muted-foreground">
        No changed files found for this pull request.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            <FileCode className="h-4 w-4" />
            {files.length} file{files.length !== 1 ? "s" : ""} changed
          </span>
          <span className="flex items-center gap-1 text-green-600 dark:text-green-300">
            <Plus className="h-3.5 w-3.5" />
            {totalAdditions}
          </span>
          <span className="flex items-center gap-1 text-red-600 dark:text-red-300">
            <Minus className="h-3.5 w-3.5" />
            {totalDeletions}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* File tree sidebar + diffs */}
      <div className="flex gap-3">
        {/* Sticky file tree */}
        <div className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-0 max-h-screen overflow-y-auto rounded-lg border border-border bg-card">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border">
              Files ({files.length})
            </div>
            <nav className="p-1 space-y-0.5">
              {files.map((file, i) => (
                <button
                  key={file.filename}
                  onClick={() => {
                    itemRefs.current[i]?.scrollIntoView({ block: "start", behavior: "smooth" });
                    useVimStore.getState().setSelectedIndex(i);
                  }}
                  className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors ${
                    i === selectedIndex
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                  title={file.filename}
                >
                  <FileStatusIcon status={file.status} />
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {file.filename.split("/").pop()}
                  </span>
                  <FileStatsBadge additions={file.additions} deletions={file.deletions} />
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* File diffs */}
        <div className="min-w-0 flex-1 space-y-2">
          {files.map((file, i) => (
            <div
              key={file.filename}
              ref={(el) => { itemRefs.current[i] = el; }}
            >
              <FileDiff
                file={file}
                isExpanded={expandedFiles.has(file.filename)}
                onToggle={() => toggleFile(file.filename)}
                isSelected={i === selectedIndex}
                onOpenInGoLand={handleOpenInGoLand}
                owner={owner}
                repo={repo}
                headRef={headRef}
                prNodeId={prNodeId}
                fileThreads={reviewThreads?.filter((t) => t.path === file.filename)}
                onToggleResolved={onToggleResolved}
                onCommentAdded={onCommentAdded}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
