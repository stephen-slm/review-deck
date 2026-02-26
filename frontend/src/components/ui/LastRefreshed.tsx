import { useState, useEffect } from "react";
import { timeAgo } from "@/lib/utils";

/**
 * Displays "Updated Xm ago" for a given epoch-millis timestamp.
 * Auto-ticks every 30 seconds so the label stays current.
 * Renders nothing when the timestamp is 0 (never fetched).
 */
export function LastRefreshed({ timestamp }: { timestamp: number }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!timestamp) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [timestamp]);

  if (!timestamp) return null;

  return (
    <span className="text-xs text-muted-foreground">
      Updated {timeAgo(timestamp)}
    </span>
  );
}
