import { useState, useRef, useEffect, useMemo } from "react";
import { UserPlus, Search, X, Loader2 } from "lucide-react";
import { GetOrgMembers, RequestReviews } from "../../../wailsjs/go/services/PullRequestService";
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
  const [allMembers, setAllMembers] = useState<github.User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { orgs } = useSettingsStore();
  const syncTriggered = useRef(false);

  // Close on outside click.
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

  // On dropdown open: focus input, load full member list, trigger sync if needed.
  useEffect(() => {
    if (!isOpen) return;
    if (inputRef.current) inputRef.current.focus();

    if (orgs.length === 0) return;
    const org = orgs[0];

    setIsLoading(true);
    GetOrgMembers(org)
      .then((members) => {
        setAllMembers(members || []);
        // If cache was empty, trigger a sync and reload.
        if (!members || members.length === 0) {
          if (!syncTriggered.current) {
            syncTriggered.current = true;
            SyncOrgMembers(org)
              .then(() => GetOrgMembers(org))
              .then((m) => setAllMembers(m || []))
              .catch(() => {});
          }
        }
      })
      .catch(() => setAllMembers([]))
      .finally(() => setIsLoading(false));
  }, [isOpen, orgs]);

  // Client-side filtering: match login or name, exclude already-assigned reviewers.
  const filteredMembers = useMemo(() => {
    const q = query.toLowerCase();
    return allMembers.filter((u) => {
      if (currentReviewers.includes(u.login)) return false;
      if (q.length < 1) return true;
      return (
        u.login.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q))
      );
    });
  }, [allMembers, query, currentReviewers]);

  // Show at most 20 results.
  const visibleMembers = filteredMembers.slice(0, 20);

  const handleAssign = async (user: github.User) => {
    setIsAssigning(true);
    setError(null);
    try {
      await RequestReviews(prNodeId, [user.nodeId], []);
      setIsOpen(false);
      setQuery("");
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
              onChange={(e) => {
                setQuery(e.target.value);
                setError(null);
              }}
              placeholder="Search users..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="max-h-48 overflow-auto p-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : visibleMembers.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {allMembers.length === 0
                  ? "No cached members. Syncing..."
                  : "No matching users"}
              </div>
            ) : (
              visibleMembers.map((user) => (
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
