import { useState, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { KeyRound, LogOut, Plus, Trash2, CheckCircle, XCircle, Loader2, Bot, Timer } from "lucide-react";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";

export function SettingsPage() {
  const { isAuthenticated, user, error, login, logout, clearError } = useAuthStore();
  const { orgs, loadOrgs, addOrg, removeOrg, filterBots, loadFilterBots, setFilterBots, cacheTTLMinutes, loadCacheTTL, setCacheTTL } = useSettingsStore();

  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newOrg, setNewOrg] = useState("");

  useEffect(() => {
    loadOrgs();
    loadFilterBots();
    loadCacheTTL();
  }, [loadOrgs, loadFilterBots, loadCacheTTL]);

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

  const handleLogout = async () => {
    await logout();
    setToken("");
  };

  const handleAddOrg = async () => {
    const org = newOrg.trim();
    if (!org) return;
    await addOrg(org);
    setNewOrg("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter") action();
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure authentication and tracked organizations.
        </p>
      </div>

      {/* Authentication Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">GitHub Authentication</h3>
        </div>

        {isAuthenticated && user ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.login}
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent">
                    <span className="text-sm font-medium">{user.login[0]?.toUpperCase()}</span>
                  </div>
                )}
                <div>
                  <p className="font-medium text-foreground">{user.name || user.login}</p>
                  <p className="text-sm text-muted-foreground">@{user.login}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-sm text-green-500">
                  <CheckCircle className="h-4 w-4" />
                  Connected
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter a GitHub Personal Access Token with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">repo</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">read:org</code>, and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">read:user</code> scopes.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleLogin)}
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
              <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={() => BrowserOpenURL("https://github.com/settings/tokens/new?scopes=repo,read:org,read:user&description=Review+Deck")}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Generate a new token on GitHub
            </button>
          </div>
        )}
      </section>

      {/* Organizations Section */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Tracked Organizations</h3>
        <p className="text-sm text-muted-foreground">
          Add GitHub organizations to track pull requests from.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={newOrg}
            onChange={(e) => setNewOrg(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleAddOrg)}
            placeholder="organization-name"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleAddOrg}
            disabled={!newOrg.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

        {orgs.length > 0 ? (
          <ul className="space-y-2">
            {orgs.map((org) => (
              <li
                key={org}
                className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2.5"
              >
                <span className="text-sm font-medium">{org}</span>
                <button
                  onClick={() => removeOrg(org)}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No organizations tracked yet. Add one above to get started.
          </p>
        )}
      </section>

      {/* Filters Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Filters</h3>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                Filter out bot pull requests
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Hide PRs authored by Dependabot, Renovate, GitHub Actions, and
                Snyk from all views.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={filterBots}
              onClick={() => setFilterBots(!filterBots)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                filterBots ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
                  filterBots ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Cache Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Cache</h3>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                Cache expiry
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Data is served from cache unless you click Refresh. Pages will
                re-fetch from GitHub after this period.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={60}
                value={cacheTTLMinutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setCacheTTL(val);
                }}
                className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
