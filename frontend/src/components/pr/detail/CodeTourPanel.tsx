import {
  Map,
  Loader2,
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { mdComponents } from "@/lib/markdownComponents";
import { parsePatch, extractDiffRange } from "@/lib/diffUtils";
import { langFromFilename, highlightLine } from "@/lib/highlighter";
import type { CodeTourData } from "@/types/codeTour";
import type { github } from "../../../../wailsjs/go/models";

function StepDiffSnippet({ file, startLine, endLine, prFiles }: {
  file: string;
  startLine: number;
  endLine: number;
  prFiles: github.PRFile[];
}) {
  const matchedFile = prFiles.find(
    (f) => f.filename === file || f.filename.endsWith("/" + file),
  );
  if (!matchedFile?.patch) return null;
  const allLines = parsePatch(matchedFile.patch);
  const snippet = extractDiffRange(allLines, startLine, endLine);
  if (snippet.length === 0) return null;

  const lang = langFromFilename(file);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {file}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-xs">
          <tbody>
            {snippet.map((line, i) => (
              <tr
                key={i}
                className={
                  line.type === "add"
                    ? "bg-green-50 dark:bg-green-950/30"
                    : line.type === "del"
                      ? "bg-red-50 dark:bg-red-950/30"
                      : ""
                }
              >
                <td className="w-[1px] select-none whitespace-nowrap border-r border-border px-2 py-0 text-right text-muted-foreground/50">
                  {line.oldLine ?? ""}
                </td>
                <td className="w-[1px] select-none whitespace-nowrap border-r border-border px-2 py-0 text-right text-muted-foreground/50">
                  {line.newLine ?? ""}
                </td>
                <td className="w-[1px] select-none border-r border-border px-1 py-0 text-center text-muted-foreground/50">
                  {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                </td>
                <td
                  className="whitespace-pre px-2 py-0"
                  dangerouslySetInnerHTML={{ __html: highlightLine(line.content, lang) }}
                />
              </tr>
            ))}
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
  onStart: () => void;
  onCancel: () => void;
}) {
  if (!hasLocalPath) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12">
        <Map className="h-8 w-8 text-muted-foreground" />
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
        <Map className="h-8 w-8 text-muted-foreground" />
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
        <Map className="h-10 w-10 text-purple-500/60" />
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
          <Map className="h-4 w-4" />
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
          <Map className="h-4 w-4" />
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
          <Map className="h-4 w-4 text-purple-500" />
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
        </div>
      </div>

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
