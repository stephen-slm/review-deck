import { useState, useRef, useEffect, useMemo } from "react";
import { Tag, Search, X, Loader2, Check } from "lucide-react";
import { AddLabels, RemoveLabels } from "../../../wailsjs/go/services/PullRequestService";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVimStore } from "@/stores/vimStore";
import { github } from "../../../wailsjs/go/models";
import { hexLuminance } from "@/lib/utils";

interface LabelAssignProps {
  prNodeId: string;
  currentLabels: github.Label[];
  repoOwner: string;
  repoName: string;
  onChanged?: () => void;
  /** Mutable ref where the component registers a toggle function for external triggering. */
  triggerRef?: React.MutableRefObject<(() => void) | null>;
}

export function LabelAssign({
  prNodeId,
  currentLabels,
  repoOwner,
  repoName,
  onChanged,
  triggerRef,
}: LabelAssignProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const repoKey = `${repoOwner}/${repoName}`;
  const allLabels = useSettingsStore((s) => s.labelsByRepo[repoKey] || []);
  const syncLabels = useSettingsStore((s) => s.syncLabels);

  // Set of currently applied label IDs for quick lookup.
  const appliedIds = useMemo(
    () => new Set(currentLabels.map((l) => l.id)),
    [currentLabels],
  );

  // Expose toggle to parent via triggerRef.
  useEffect(() => {
    if (triggerRef) triggerRef.current = () => setIsOpen((o) => !o);
    return () => { if (triggerRef) triggerRef.current = null; };
  }, [triggerRef]);

  // Close on outside click.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Register vim escape override to close dropdown.
  useEffect(() => {
    if (isOpen) {
      useVimStore.setState({ onEscape: () => setIsOpen(false) });
      return () => useVimStore.setState({ onEscape: null });
    }
  }, [isOpen]);

  // On open: focus input, sync labels if cache is empty.
  useEffect(() => {
    if (!isOpen) return;
    if (inputRef.current) inputRef.current.focus();
    if (allLabels.length === 0) {
      syncLabels(repoOwner, repoName).catch(() => {});
    }
  }, [isOpen, allLabels.length, repoOwner, repoName, syncLabels]);

  // Filter labels by search query.
  const filteredLabels = useMemo(() => {
    const q = query.toLowerCase();
    if (q.length === 0) return allLabels;
    return allLabels.filter((l) => l.name.toLowerCase().includes(q));
  }, [allLabels, query]);

  const handleToggle = async (label: github.Label) => {
    setIsToggling(label.id);
    setError(null);
    try {
      if (appliedIds.has(label.id)) {
        await RemoveLabels(prNodeId, [label.id]);
      } else {
        await AddLabels(prNodeId, [label.id]);
      }
      onChanged?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsToggling(null);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        title="Add or remove labels"
      >
        <Tag className="h-3.5 w-3.5" />
        <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground/60">b</kbd>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-popover shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setError(null); }}
              placeholder="Search labels..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="max-h-48 overflow-auto p-1">
            {allLabels.length === 0 ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLabels.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No matching labels
              </div>
            ) : (
              filteredLabels.map((label) => {
                const applied = appliedIds.has(label.id);
                const toggling = isToggling === label.id;
                const bg = label.color ? `#${label.color}` : undefined;
                const textColor = bg
                  ? hexLuminance(bg) > 0.5 ? "#24292f" : "#ffffff"
                  : undefined;

                return (
                  <button
                    key={label.id}
                    onClick={() => handleToggle(label)}
                    disabled={toggling}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {toggling ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : applied ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : null}
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: bg,
                        color: textColor,
                        border: bg ? `1px solid ${bg}` : undefined,
                      }}
                    >
                      {label.name}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {error && (
            <div className="border-t border-border px-2 py-1.5 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
