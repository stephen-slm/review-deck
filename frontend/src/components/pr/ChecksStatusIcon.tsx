import { CheckCircle, XCircle, Loader2, Circle } from "lucide-react";

interface ChecksStatusIconProps {
  status: string;
}

export function ChecksStatusIcon({ status }: ChecksStatusIconProps) {
  switch (status) {
    case "SUCCESS":
      return <span title="Checks passing"><CheckCircle className="h-4 w-4 text-green-400" /></span>;
    case "FAILURE":
    case "ERROR":
      return <span title="Checks failing"><XCircle className="h-4 w-4 text-red-400" /></span>;
    case "PENDING":
      return <span title="Checks running"><Loader2 className="h-4 w-4 animate-spin text-yellow-400" /></span>;
    default:
      return <span title="No checks"><Circle className="h-4 w-4 text-muted-foreground" /></span>;
  }
}
