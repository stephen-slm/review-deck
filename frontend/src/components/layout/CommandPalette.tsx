import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, FolderGit2, Plus, Check } from "lucide-react";
import { useVimStore } from "@/stores/vimStore";
import { useRepoStore } from "@/stores/repoStore";
import { cn } from "@/lib/utils";

export function CommandPalette() {
  const isOpen = useVimStore((s) => s.commandPaletteOpen);
  const toggle = useVimStore((s) => s.toggleCommandPalette);

  const repos = useRepoStore((s) => s.repos);
  const selectedRepoId = useRepoStore((s) => s.selectedRepoId);
  const selectRepo = useRepoStore((s) => s.selectRepo);
  const addRepo = useRepoStore((s) => s.addRepo);

  const [query, setQuery] = useState("");
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Filter repos by search query.
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return repos;
    return repos.filter((r) =>
      `${r.repoOwner}/${r.repoName}`.toLowerCase().includes(q),
    );
  }, [repos, query]);

  // Total item count: repos + "Add repository" action.
  const totalItems = filtered.length + 1;

  // Reset state when opening.
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setHighlightedIdx(0);
      // Focus input on next frame (after render).
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Scroll highlighted item into view.
  useEffect(() => {
    const el = itemRefs.current[highlightedIdx];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx]);

  // Clamp highlight when the filtered list changes.
  useEffect(() => {
    setHighlightedIdx((prev) => Math.min(prev, totalItems - 1));
  }, [totalItems]);

  const close = useCallback(() => {
    if (isOpen) toggle();
  }, [isOpen, toggle]);

  const handleSelect = useCallback(
    (idx: number) => {
      if (idx < filtered.length) {
        selectRepo(filtered[idx].id);
        close();
      } else {
        // "Add repository" action.
        close();
        addRepo();
      }
    },
    [filtered, selectRepo, addRepo, close],
  );

  // Keyboard navigation within the palette.
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setHighlightedIdx((prev) => (prev + 1) % totalItems);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setHighlightedIdx((prev) => (prev - 1 + totalItems) % totalItems);
          break;
        }
        case "Enter": {
          e.preventDefault();
          handleSelect(highlightedIdx);
          break;
        }
        case "Escape": {
          e.preventDefault();
          close();
          break;
        }
        case "k": {
          // Cmd+K toggles the palette closed.
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            close();
          }
          break;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, totalItems, highlightedIdx, handleSelect, close]);

  if (!isOpen) return null;

  const isMac = navigator.platform.includes("Mac");
  const modKey = isMac ? "\u2318" : "Ctrl";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/50"
      onClick={close}
    >
      <div
        className="mt-[18vh] h-fit w-full max-w-lg animate-in fade-in slide-in-from-top-2 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIdx(0);
              }}
              placeholder="Search repositories..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
              {modKey}K
            </kbd>
          </div>

          {/* Results list */}
          <div ref={listRef} className="max-h-[40vh] overflow-auto py-1">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No matching repositories
              </div>
            )}

            {filtered.map((repo, i) => {
              const isSelected = repo.id === selectedRepoId;
              const isHighlighted = i === highlightedIdx;
              return (
                <div
                  key={repo.id}
                  ref={(el) => { itemRefs.current[i] = el; }}
                  onClick={() => handleSelect(i)}
                  onMouseEnter={() => setHighlightedIdx(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors",
                    isHighlighted && "bg-accent text-accent-foreground",
                    !isHighlighted && "text-foreground",
                  )}
                >
                  <FolderGit2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {repo.repoOwner}/{repo.repoName}
                  </span>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </div>
              );
            })}

            {/* Add repository action */}
            <div
              ref={(el) => { itemRefs.current[filtered.length] = el; }}
              onClick={() => handleSelect(filtered.length)}
              onMouseEnter={() => setHighlightedIdx(filtered.length)}
              className={cn(
                "flex cursor-pointer items-center gap-3 border-t border-border px-4 py-2 text-sm transition-colors",
                highlightedIdx === filtered.length
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="flex-1">Add repository...</span>
            </div>
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">&uarr;</kbd>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">&darr;</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">&crarr;</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
