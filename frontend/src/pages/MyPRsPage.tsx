import { useEffect, useCallback } from "react";
import { usePRStore } from "@/stores/prStore";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { PRTable } from "@/components/pr/PRTable";
import { RefreshCw, AlertCircle } from "lucide-react";

export function MyPRsPage() {
  const { isAuthenticated } = useAuthStore();
  const { orgs, loadOrgs } = useSettingsStore();
  const { myPRs, isLoadingMyPRs, error, fetchMyPRs, clearError } = usePRStore();

  const refresh = useCallback(() => {
    clearError();
    for (const org of orgs) {
      fetchMyPRs(org);
    }
  }, [orgs, fetchMyPRs, clearError]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    if (isAuthenticated && orgs.length > 0) {
      refresh();
    }
  }, [isAuthenticated, orgs, refresh]);

  if (!isAuthenticated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Connect your GitHub account in Settings to see your pull requests.
          </p>
        </div>
      </div>
    );
  }

  if (orgs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Add a GitHub organization in Settings to start tracking pull requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Pull Requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open pull requests you have authored.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={isLoadingMyPRs}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoadingMyPRs ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <PRTable
        data={myPRs}
        isLoading={isLoadingMyPRs}
        emptyMessage="No open pull requests found."
        showMerge
        showAssignReviewer
        onRefresh={refresh}
      />
    </div>
  );
}
