import { useState, useMemo, useRef, useEffect } from "react";
import {
  FileCode,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  File,
  FilePlus,
  FileX,
  ArrowRight,
} from "lucide-react";
import { github } from "../../../wailsjs/go/models";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import { useVimStore } from "@/stores/vimStore";
import { useSettingsStore } from "@/stores/settingsStore";

interface DiffViewProps {
  files: github.PRFile[] | null;
  loading: boolean;
  error: string | null;
  /** Owner and repo for "Open in GoLand" per-file buttons */
  owner?: string;
  repo?: string;
  /** Ref populated with a function to toggle expand/collapse of the currently selected file. */
  toggleSelectedRef?: React.MutableRefObject<(() => void) | null>;
}

/** Parse a unified diff patch string into individual diff lines. */
interface DiffLine {
  type: "add" | "del" | "context" | "hunk";
  content: string;
  oldLine?: number;
  newLine?: number;
}

function parsePatch(patch: string): DiffLine[] {
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

/** Renders a single file's diff. */
function FileDiff({ file, isExpanded, onToggle, isSelected, onOpenInGoLand }: {
  file: github.PRFile;
  isExpanded: boolean;
  onToggle: () => void;
  isSelected: boolean;
  onOpenInGoLand?: (filePath: string) => void;
}) {
  const diffLines = useMemo(() => parsePatch(file.patch), [file.patch]);

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
        <div className="overflow-x-auto border-t border-border">
          {diffLines.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground italic">
              {file.status === "renamed" ? "File renamed without changes" : "Binary file or no diff available"}
            </div>
          ) : (
            <table className="w-full border-collapse font-mono text-xs">
              <tbody>
                {diffLines.map((line, i) => {
                  if (line.type === "hunk") {
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

                  return (
                    <tr key={i} className={bgClass}>
                      <td className={`w-10 select-none border-r border-border/30 px-2 py-0.5 text-right ${lineNumClass}`}>
                        {line.type !== "add" ? line.oldLine : ""}
                      </td>
                      <td className={`w-10 select-none border-r border-border/30 px-2 py-0.5 text-right ${lineNumClass}`}>
                        {line.type !== "del" ? line.newLine : ""}
                      </td>
                      <td className={`whitespace-pre px-3 py-0.5 ${textClass}`}>
                        <span className="mr-1 select-none opacity-50">
                          {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                        </span>
                        {line.content}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function DiffView({ files, loading, error, owner, repo, toggleSelectedRef }: DiffViewProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
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
      setExpandedFiles(initial);
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
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
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
    if (files) setExpandedFiles(new Set(files.map((f) => f.filename)));
  };

  const collapseAll = () => {
    setExpandedFiles(new Set());
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

      {/* File diffs */}
      <div className="space-y-2">
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
            />
          </div>
        ))}
      </div>
    </section>
  );
}
