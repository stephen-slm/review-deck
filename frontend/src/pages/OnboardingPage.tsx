import { useAuthStore } from "@/stores/authStore";
import { useRepoStore } from "@/stores/repoStore";
import { FolderGit2, KeyRound, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";

export function OnboardingPage() {
  const { isAuthenticated, user, error, login, clearError } = useAuthStore();
  const { addRepo, isLoading, error: repoError, clearError: clearRepoError } = useRepoStore();
  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!token.trim()) return;
    setIsSubmitting(true);
    clearError();
    try {
      await login(token.trim());
      setToken("");
    } catch {
      // error is set in the store
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddRepo = async () => {
    clearRepoError();
    await addRepo();
  };

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome to Review Deck
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Get started by connecting your GitHub account and adding a repository.
          </p>
        </div>

        {/* Step 1: GitHub Auth */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                isAuthenticated
                  ? "bg-green-500/20 text-green-500"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              1
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Connect GitHub
            </h3>
            {isAuthenticated && user && (
              <span className="ml-auto text-xs text-green-500">
                Connected as @{user.login}
              </span>
            )}
          </div>

          {!isAuthenticated && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Enter a GitHub Personal Access Token with{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">repo</code>,{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">read:org</code>, and{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">read:user</code> scopes.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  disabled={isSubmitting}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                <button
                  onClick={handleLogin}
                  disabled={isSubmitting || !token.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  Connect
                </button>
              </div>
              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <button
                onClick={() =>
                  BrowserOpenURL(
                    "https://github.com/settings/tokens/new?scopes=repo,read:org,read:user&description=Review+Deck",
                  )
                }
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Generate a new token on GitHub
              </button>
            </div>
          )}
        </div>

        {/* Step 2: Add a Repo */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                isAuthenticated
                  ? "bg-muted text-foreground"
                  : "bg-muted text-muted-foreground/50"
              }`}
            >
              2
            </div>
            <h3
              className={`text-sm font-semibold ${
                isAuthenticated ? "text-foreground" : "text-muted-foreground/50"
              }`}
            >
              Add your first repository
            </h3>
          </div>

          {isAuthenticated && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Select a local Git repository folder. Review Deck will read the
                remote URL and track pull requests for that repo.
              </p>
              <button
                onClick={handleAddRepo}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderGit2 className="h-4 w-4" />
                )}
                Select folder
              </button>
              {repoError && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{repoError}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
