import { CheckCircle, XCircle, Clock, MessageSquare } from "lucide-react";

interface ReviewStatusBadgeProps {
  reviewDecision: string;
}

export function ReviewStatusBadge({ reviewDecision }: ReviewStatusBadgeProps) {
  switch (reviewDecision) {
    case "APPROVED":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-300">
          <CheckCircle className="h-3.5 w-3.5" />
          Approved
        </span>
      );
    case "CHANGES_REQUESTED":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-300">
          <XCircle className="h-3.5 w-3.5" />
          Changes
        </span>
      );
    case "REVIEW_REQUIRED":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-300">
          <Clock className="h-3.5 w-3.5" />
          Pending
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          None
        </span>
      );
  }
}
