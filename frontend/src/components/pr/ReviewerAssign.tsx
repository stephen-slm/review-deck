import { useState, useRef, useEffect, useCallback } from "react";
import { UserPlus, Search, X, Loader2 } from "lucide-react";
import { SearchOrgMembers, RequestReviews } from "../../../wailsjs/go/services/PullRequestService";
import { SyncOrgMembers } from "../../../wailsjs/go/main/App";
import { useSettingsStore } from "@/stores/settingsStore";
import { github } from "../../../wailsjs/go/models";

interface ReviewerAssignProps {
  prNodeId: string;
  currentReviewers: string[];
  onAssigned?: () => void;
}

export function ReviewerAssign({
  prNodeId,
  currentReviewers,
  onAssigned,
}: ReviewerAssignProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<github.User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { orgs } = useSettingsStore();
  const syncTriggered = useRef(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
    // Trigger an org member cache sync the first time the dropdown opens.
    if (isOpen && !syncTriggered.current && orgs.length > 0) {
      syncTriggered.current = true;
      SyncOrgMembers(orgs[0]).catch(() => {});
    }
  }, [isOpen, orgs]);

  const search = useCallback(
    (q: string) => {
      if (q.length < 2 || orgs.length === 0) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      SearchOrgMembers(orgs[0], q)
        .then((users) => {
          // Filter out users who are already reviewers.
          const filtered = (users || []).filter(
            (u) => !currentReviewers.includes(u.login)
          );
          setResults(filtered);
        })
        .catch(() => setResults([]))
        .finally(() => setIsSearching(false));
    },
    [orgs, currentReviewers]
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const handleAssign = async (user: github.User) => {
    setIsAssigning(true);
    setError(null);
    try {
      await RequestReviews(prNodeId, [user.nodeId], []);
      setIsOpen(false);
      setQuery("");
      setResults([]);
      onAssigned?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        title="Assign reviewer"
      >
        <UserPlus className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-popover shadow-md">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search users..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setResults([]);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="max-h-48 overflow-auto p-1">
            {isSearching ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {query.length < 2
                  ? "Type to search for users"
                  : "No users found"}
              </div>
            ) : (
              results.map((user) => (
                <button
                  key={user.login}
                  onClick={() => handleAssign(user)}
                  disabled={isAssigning}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {user.avatarUrl && (
                    <img
                      src={user.avatarUrl}
                      className="h-5 w-5 rounded-full"
                      alt=""
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-popover-foreground">
                      {user.login}
                    </p>
                    {user.name && (
                      <p className="truncate text-xs text-muted-foreground">
                        {user.name}
                      </p>
                    )}
                  </div>
                </button>
              ))
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
