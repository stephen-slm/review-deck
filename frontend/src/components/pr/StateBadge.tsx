import { GitPullRequest, GitMerge, CircleDot, FileEdit } from "lucide-react";

interface StateBadgeProps {
  state: string;
  isDraft: boolean;
}

export function StateBadge({ state, isDraft }: StateBadgeProps) {
  if (isDraft) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
        <FileEdit className="h-3 w-3" />
        Draft
      </span>
    );
  }

  switch (state) {
    case "MERGED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-900/60 px-2 py-0.5 text-xs font-medium text-purple-300">
          <GitMerge className="h-3 w-3" />
          Merged
        </span>
      );
    case "CLOSED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-900/60 px-2 py-0.5 text-xs font-medium text-red-300">
          <CircleDot className="h-3 w-3" />
          Closed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-900/60 px-2 py-0.5 text-xs font-medium text-green-300">
          <GitPullRequest className="h-3 w-3" />
          Open
        </span>
      );
  }
}
