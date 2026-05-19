import { useEffect, useRef, useState } from "react";
import { Copy, CheckCircle, Trash2, X } from "lucide-react";
import { useVimStore } from "@/stores/vimStore";
import {
  getDebugEntries,
  onDebugEntry,
  formatDebugLog,
  type Entry,
  type LogLevel,
} from "@/lib/debugLog";

const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: "text-foreground",
  warn: "text-yellow-500",
  error: "text-red-400",
};

const LEVEL_BG: Record<LogLevel, string> = {
  debug: "",
  warn: "bg-yellow-500/5",
  error: "bg-red-500/8",
};

function formatTs(ms: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return m > 0 ? `${m}m${sec.padStart(4, "0")}s` : `${sec.padStart(6, " ")}s`;
}

type Filter = "all" | "debug" | "warn" | "error";

export function DebugPanel() {
  const open = useVimStore((s) => s.debugPanelOpen);
  const toggle = useVimStore((s) => s.toggleDebugPanel);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setEntries(getDebugEntries());
    return onDebugEntry(() => setEntries(getDebugEntries()));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, toggle]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [entries, autoScroll, filter, search]);

  if (!open) return null;

  const lowerSearch = search.toLowerCase();
  const visible = entries.filter((e) => {
    if (filter !== "all" && e.level !== filter) return false;
    if (lowerSearch && !e.tag.toLowerCase().includes(lowerSearch) && !e.detail.toLowerCase().includes(lowerSearch)) return false;
    return true;
  });

  const counts = { debug: 0, warn: 0, error: 0 };
  for (const e of entries) counts[e.level]++;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatDebugLog());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setEntries([]);
  };

  const handleScroll = () => {
    if (!listRef.current) return;
    const el = listRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Debug Console</h2>
          <span className="text-[11px] text-muted-foreground">{entries.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied ? <><CheckCircle className="h-3 w-3 text-green-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
          </button>
          <button
            onClick={handleClear}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
          <button
            onClick={toggle}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-1.5">
        {/* Level filters */}
        <div className="flex items-center gap-1">
          {(["all", "debug", "warn", "error"] as const).map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                filter === level ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {level === "all" ? "All" : level.charAt(0).toUpperCase() + level.slice(1)}
              {level !== "all" && counts[level] > 0 && (
                <span className={`ml-1 ${level === "error" ? "text-red-400" : level === "warn" ? "text-yellow-500" : "text-muted-foreground"}`}>
                  {counts[level]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Filter logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-6 flex-1 rounded border border-border bg-muted px-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
        />

        {/* Auto-scroll indicator */}
        <button
          onClick={() => {
            setAutoScroll(!autoScroll);
            if (!autoScroll) bottomRef.current?.scrollIntoView({ behavior: "auto" });
          }}
          className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
            autoScroll ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Auto-scroll {autoScroll ? "on" : "off"}
        </button>
      </div>

      {/* Log entries */}
      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-auto font-mono text-xs">
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {entries.length === 0 ? "No log entries yet" : "No entries match the current filter"}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {visible.map((e, i) => (
                <tr key={i} className={`border-b border-border/30 hover:bg-muted/50 ${LEVEL_BG[e.level]}`}>
                  <td className="whitespace-nowrap px-3 py-0.5 text-muted-foreground/60 tabular-nums">
                    {formatTs(e.ts)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-0.5">
                    <span className={`rounded px-1 py-px text-[10px] font-medium ${
                      e.level === "error" ? "bg-red-500/15 text-red-400" :
                      e.level === "warn" ? "bg-yellow-500/15 text-yellow-500" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {e.level === "debug" ? "DBG" : e.level === "warn" ? "WRN" : "ERR"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-0.5 font-medium text-accent-foreground">
                    {e.tag}
                  </td>
                  <td className={`w-full px-2 py-0.5 break-all ${LEVEL_STYLES[e.level]}`}>
                    {e.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
