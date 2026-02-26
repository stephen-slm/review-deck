import { GitPullRequest, GitMerge, CircleDot, FileEdit, ListOrdered } from "lucide-react";

interface StateBadgeProps {
  state: string;
  isDraft: boolean;
  isInMergeQueue?: boolean;
}

export function StateBadge({ state, isDraft, isInMergeQueue }: StateBadgeProps) {
  if (isInMergeQueue) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
        <ListOrdered className="h-3 w-3" />
        Queued
      </span>
    );
  }

  if (isDraft) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800/70 dark:text-slate-200">
        <FileEdit className="h-3 w-3" />
        Draft
      </span>
    );
  }

  switch (state) {
    case "MERGED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-purple-900/60 dark:text-purple-200">
          <GitMerge className="h-3 w-3" />
          Merged
        </span>
      );
    case "CLOSED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/60 dark:text-red-200">
          <CircleDot className="h-3 w-3" />
          Closed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/60 dark:text-green-200">
          <GitPullRequest className="h-3 w-3" />
          Open
        </span>
      );
  }
}
