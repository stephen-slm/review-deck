import { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useVimStore } from "@/stores/vimStore";
import { themeChoices, getTheme, ThemeChoice } from "@/theme";
import { KeyRound, LogOut, Plus, Trash2, CheckCircle, XCircle, Loader2, Bot, Timer, Users, RefreshCw, Star, ChevronUp, ChevronDown, GitFork, Palette, Code, AlertTriangle } from "lucide-react";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { GetOrgMembers, SyncOrgMembers } from "../../wailsjs/go/services/PullRequestService";
import { github } from "../../wailsjs/go/models";
import { useFlagStore } from "@/stores/flagStore";

export function SettingsPage() {
  const { isAuthenticated, user, error, login, logout, clearError } = useAuthStore();
  const { orgs, loadOrgs, addOrg, removeOrg, filterBots, loadFilterBots, setFilterBots, hideStackedPRs, loadHideStackedPRs, setHideStackedPRs, hideDraftPRs, loadHideDraftPRs, setHideDraftPRs, hideCopilotReviews, loadHideCopilotReviews, setHideCopilotReviews, theme, loadTheme, setTheme, cacheTTLMinutes, loadCacheTTL, setCacheTTL, pollIntervalMinutes, loadPollInterval, setPollInterval, prRefreshIntervalSeconds, loadPRRefreshInterval, setPRRefreshInterval, teamsByOrg, loadAllTeams, syncTeams, setTeamEnabled, prioritiesByOrg, loadAllPriorities, addPriority, removePriority, movePriority, excludedReposByOrg, loadAllExcludedRepos, addExcludedRepo, removeExcludedRepo, sourceBasePath, loadSourceBasePath, setSourceBasePath } = useSettingsStore();

  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newOrg, setNewOrg] = useState("");
  const [syncingOrg, setSyncingOrg] = useState<string | null>(null);
  const [newPriorityName, setNewPriorityName] = useState("");
  const [newPriorityType, setNewPriorityType] = useState<"user" | "team">("user");
  const [newExcludedRepo, setNewExcludedRepo] = useState("");
  const [syncingMembers, setSyncingMembers] = useState<string | null>(null);
  const [membersByOrg, setMembersByOrg] = useState<Record<string, github.User[]>>({});
  const [showPrioritySuggestions, setShowPrioritySuggestions] = useState(false);

  // Flag rules state
  const { rules: flagRules, loadRules: loadFlagRules, addRule, removeRule, toggleRule } = useFlagStore();
  const [newRuleType, setNewRuleType] = useState<"keyword" | "size">("keyword");
  const [newRuleKeyword, setNewRuleKeyword] = useState("");
  const [newRuleSizeOp, setNewRuleSizeOp] = useState<"gt" | "lt" | "eq">("gt");
  const [newRuleSizeValue, setNewRuleSizeValue] = useState("");

  useEffect(() => {
    loadOrgs();
    loadFilterBots();
    loadHideStackedPRs();
    loadHideCopilotReviews();
    loadTheme();
    loadCacheTTL();
    loadPollInterval();
    loadSourceBasePath();
    loadHideDraftPRs();
    loadPRRefreshInterval();
    loadFlagRules();
  }, [loadOrgs, loadFilterBots, loadHideStackedPRs, loadHideDraftPRs, loadHideCopilotReviews, loadTheme, loadCacheTTL, loadPollInterval, loadPRRefreshInterval, loadSourceBasePath, loadFlagRules]);

  // Register j/k as page scroll on this non-list page.
  useEffect(() => {
    const scrollEl = document.getElementById("scroll-region");
    useVimStore.getState().registerActions({
      onMoveDown: () => scrollEl?.scrollBy(0, 150),
      onMoveUp: () => scrollEl?.scrollBy(0, -150),
    });
    return () => useVimStore.getState().clearActions();
  }, []);

  // Load teams and priorities for all orgs once orgs are loaded; sync teams from GitHub if none cached yet.
  useEffect(() => {
    if (orgs.length === 0) return;
    loadAllTeams().then(() => {
      const current = useSettingsStore.getState().teamsByOrg;
      for (const org of orgs) {
        if (!current[org] || current[org].length === 0) {
          syncTeams(org);
        }
      }
    });
    loadAllPriorities();
    loadAllExcludedRepos();
    // Load cached org members for priority autocomplete.
    for (const org of orgs) {
      GetOrgMembers(org).then((members) => {
        setMembersByOrg((prev) => ({ ...prev, [org]: members || [] }));
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgs]);

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

  const themeOptions = useMemo(
    () =>
      themeChoices.map((choice: ThemeChoice) => {
        if (choice === "system") {
          return {
            name: "system" as ThemeChoice,
            displayName: "System",
            description: "Follows your OS preference",
            preview: { background: "linear-gradient(135deg, #F7F9FB 50%, #2E3440 50%)", accent: "#88C0D0" },
          };
        }
        const def = getTheme(choice);
        return {
          name: choice as ThemeChoice,
          displayName: def.displayName,
          description: choice === "nord" ? "Low-light friendly" : "Default light theme",
          preview: def.preview,
        };
      }),
    [],
  );

  return (
    <div className="max-w-2xl space-y-6">
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
          <div className="rounded-lg border border-border bg-card p-3">
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

      {/* Appearance Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Appearance</h3>
        </div>
        <p className="text-sm text-muted-foreground">Choose a color theme for the app.</p>

        <div className="grid gap-3 sm:grid-cols-3">
          {themeOptions.map((opt) => {
            const selected = theme === opt.name;
            return (
              <button
                key={opt.name}
                onClick={() => setTheme(opt.name)}
                className={`flex w-full flex-col items-center gap-2 rounded-lg border bg-card p-3 text-center transition-colors ${
                  selected ? "border-primary ring-2 ring-ring" : "border-border hover:border-accent"
                }`}
                aria-pressed={selected}
              >
                <div className="flex h-10 w-full overflow-hidden rounded-md border border-border shadow-sm">
                  {opt.name === "system" ? (
                    <span className="flex-1" style={{ background: opt.preview.background }} />
                  ) : (
                    <>
                      <span className="flex-1" style={{ backgroundColor: opt.preview.background }} />
                      <span className="w-5" style={{ backgroundColor: opt.preview.accent }} />
                    </>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{opt.displayName}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
                {selected && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
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
                <div className="flex items-center gap-1">
                  <button
                    onClick={async () => {
                      setSyncingMembers(org);
                      try {
                        await SyncOrgMembers(org);
                        const members = await GetOrgMembers(org);
                        setMembersByOrg((prev) => ({ ...prev, [org]: members || [] }));
                      } finally {
                        setSyncingMembers(null);
                      }
                    }}
                    disabled={syncingMembers === org}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    title="Sync org members from GitHub"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncingMembers === org ? "animate-spin" : ""}`} />
                    Sync members
                  </button>
                  <button
                    onClick={() => removeOrg(org)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
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

        <div className="rounded-lg border border-border bg-card p-3 space-y-4">
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

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                Hide stacked pull requests
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Hide PRs that target a branch other than main or master (i.e.
                stacked/chained PRs). Can also be toggled per table.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={hideStackedPRs}
              onClick={() => setHideStackedPRs(!hideStackedPRs)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                hideStackedPRs ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
                  hideStackedPRs ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                Hide draft pull requests
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Hide PRs marked as draft. Can also be toggled per table with{" "}
                <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">t</kbd>.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={hideDraftPRs}
              onClick={() => setHideDraftPRs(!hideDraftPRs)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                hideDraftPRs ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
                  hideDraftPRs ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                Hide Copilot review comments
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Filter out comments and review threads authored by
                copilot-pull-request-reviewer[bot] on the PR detail page.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={hideCopilotReviews}
              onClick={() => setHideCopilotReviews(!hideCopilotReviews)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                hideCopilotReviews ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
                  hideCopilotReviews ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Excluded Repositories Section */}
      {isAuthenticated && orgs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <GitFork className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Excluded Repositories</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Repositories listed here are excluded from all PR views and poller
            queries. Enter the repo name only (not the full org/repo path).
          </p>

          {orgs.map((org) => {
            const repos = excludedReposByOrg[org] || [];
            return (
              <div key={org} className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">{org}</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newExcludedRepo}
                    onChange={(e) => setNewExcludedRepo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newExcludedRepo.trim()) {
                        addExcludedRepo(org, newExcludedRepo.trim());
                        setNewExcludedRepo("");
                      }
                    }}
                    placeholder="repository-name"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={() => {
                      if (!newExcludedRepo.trim()) return;
                      addExcludedRepo(org, newExcludedRepo.trim());
                      setNewExcludedRepo("");
                    }}
                    disabled={!newExcludedRepo.trim()}
                    className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Exclude
                  </button>
                </div>
                {repos.length > 0 ? (
                  <ul className="space-y-1">
                    {repos.map((repo) => (
                      <li
                        key={repo}
                        className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2"
                      >
                        <span className="text-sm text-foreground">
                          {org}/{repo}
                        </span>
                        <button
                          onClick={() => removeExcludedRepo(org, repo)}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                          title="Remove exclusion"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
                    No repositories excluded.
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Teams Section */}
      {isAuthenticated && orgs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Teams</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Enable the teams whose review requests you want to track. Disabled
            teams are excluded from the poller and team review request views.
          </p>

          {orgs.map((org) => {
            const teams = teamsByOrg[org] || [];
            return (
              <div key={org} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-foreground">{org}</h4>
                  <button
                    onClick={async () => {
                      setSyncingOrg(org);
                      try {
                        await syncTeams(org);
                      } finally {
                        setSyncingOrg(null);
                      }
                    }}
                    disabled={syncingOrg === org}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${syncingOrg === org ? "animate-spin" : ""}`} />
                    Sync
                  </button>
                </div>
                {teams.length > 0 ? (
                  <ul className="space-y-1">
                    {teams.map((team) => (
                      <li
                        key={team.teamSlug}
                        className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">{team.teamName}</p>
                          <p className="text-xs text-muted-foreground">@{org}/{team.teamSlug}</p>
                        </div>
                        <button
                          role="switch"
                          aria-checked={team.enabled}
                          onClick={() => setTeamEnabled(org, team.teamSlug, !team.enabled)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                            team.enabled ? "bg-primary" : "bg-muted"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
                              team.enabled ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
                    No teams found. Click Sync to fetch from GitHub.
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Priority Reviewers Section */}
      {isAuthenticated && orgs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Priority Reviewers</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            PRs from prioritised users or teams are surfaced first in the Review
            Requests view and marked with a visual indicator.
          </p>

          {orgs.map((org) => {
            const priorities = prioritiesByOrg[org] || [];
            const existingNames = new Set(priorities.map((p) => p.name));
            const suggestions = useMemo(() => {
              const q = newPriorityName.toLowerCase();
              if (newPriorityType === "team") {
                return (teamsByOrg[org] || [])
                  .filter((t) => !existingNames.has(t.teamSlug) && (q.length === 0 || t.teamSlug.toLowerCase().includes(q) || t.teamName.toLowerCase().includes(q)))
                  .slice(0, 10)
                  .map((t) => ({ name: t.teamSlug, label: t.teamName, avatar: "" }));
              }
              return (membersByOrg[org] || [])
                .filter((u) => !existingNames.has(u.login) && (q.length === 0 || u.login.toLowerCase().includes(q) || (u.name && u.name.toLowerCase().includes(q))))
                .slice(0, 10)
                .map((u) => ({ name: u.login, label: u.name || u.login, avatar: u.avatarUrl || "" }));
            }, [newPriorityName, newPriorityType, org, membersByOrg, teamsByOrg, existingNames]);
            return (
              <div key={org} className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">{org}</h4>

                {/* Add form with autocomplete */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={newPriorityName}
                      onChange={(e) => {
                        setNewPriorityName(e.target.value);
                        setShowPrioritySuggestions(true);
                      }}
                      onFocus={() => setShowPrioritySuggestions(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newPriorityName.trim()) {
                          addPriority(org, newPriorityName.trim(), newPriorityType);
                          setNewPriorityName("");
                          setShowPrioritySuggestions(false);
                        }
                        if (e.key === "Escape") setShowPrioritySuggestions(false);
                      }}
                      placeholder={newPriorityType === "team" ? "team-slug" : "username"}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {showPrioritySuggestions && suggestions.length > 0 && (
                      <ul className="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                        {suggestions.map((s) => (
                          <li key={s.name}>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                addPriority(org, s.name, newPriorityType);
                                setNewPriorityName("");
                                setShowPrioritySuggestions(false);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                            >
                              {s.avatar && (
                                <img src={s.avatar} className="h-5 w-5 rounded-full" alt="" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-popover-foreground">{s.name}</p>
                                {s.label !== s.name && (
                                  <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                                )}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewPriorityType((prev) => {
                        const next = prev === "user" ? "team" : "user";
                        setNewPriorityName("");
                        return next;
                      });
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    title={`Switch to ${newPriorityType === "user" ? "Team" : "User"}`}
                  >
                    {newPriorityType === "user" ? (
                      <><Users className="h-3.5 w-3.5" /> User</>
                    ) : (
                      <><Users className="h-3.5 w-3.5" /> Team</>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (!newPriorityName.trim()) return;
                      addPriority(org, newPriorityName.trim(), newPriorityType);
                      setNewPriorityName("");
                      setShowPrioritySuggestions(false);
                    }}
                    disabled={!newPriorityName.trim()}
                    className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>

                {/* Priority list */}
                {priorities.length > 0 ? (
                  <ul className="space-y-1">
                    {priorities.map((p, idx) => (
                      <li
                        key={`${p.name}-${p.type}`}
                        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
                      >
                        <Star className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                        <span className="flex-1 text-sm font-medium text-foreground">
                          {p.name}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {p.type}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => movePriority(org, p.name, p.type, "up")}
                            disabled={idx === 0}
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                            title="Move up (higher priority)"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => movePriority(org, p.name, p.type, "down")}
                            disabled={idx === priorities.length - 1}
                            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                            title="Move down (lower priority)"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          onClick={() => removePriority(org, p.name, p.type)}
                          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
                    No priority reviewers configured.
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Cache Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Cache</h3>
        </div>

        <div className="rounded-lg border border-border bg-card p-3 space-y-4">
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

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                Poll interval
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                How often the background poller fetches new data from GitHub.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={60}
                value={pollIntervalMinutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setPollInterval(val);
                }}
                className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                PR detail refresh interval
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                How often the PR detail page auto-refreshes data from GitHub.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={10}
                max={300}
                value={prRefreshIntervalSeconds}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setPRRefreshInterval(val);
                }}
                className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">sec</span>
            </div>
          </div>
        </div>
      </section>

      {/* Flag Rules Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Flagged PR Rules</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          PRs matching enabled rules are highlighted with a red border and
          aggregated in the Flagged tab. Keywords are matched case-insensitively
          against title, body, branch, and labels. Size is additions + deletions.
        </p>

        {/* Add rule form */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div className="flex items-center gap-2">
            <select
              value={newRuleType}
              onChange={(e) => setNewRuleType(e.target.value as "keyword" | "size")}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="keyword">Keyword</option>
              <option value="size">Size</option>
            </select>

            {newRuleType === "keyword" ? (
              <input
                type="text"
                value={newRuleKeyword}
                onChange={(e) => setNewRuleKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newRuleKeyword.trim()) {
                    addRule({ enabled: true, type: "keyword", keyword: newRuleKeyword.trim() });
                    setNewRuleKeyword("");
                  }
                }}
                placeholder="e.g. breaking, migration, security"
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <>
                <select
                  value={newRuleSizeOp}
                  onChange={(e) => setNewRuleSizeOp(e.target.value as "gt" | "lt" | "eq")}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="gt">&gt; greater than</option>
                  <option value="lt">&lt; less than</option>
                  <option value="eq">= equal to</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={newRuleSizeValue}
                  onChange={(e) => setNewRuleSizeValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseInt(newRuleSizeValue, 10);
                      if (!isNaN(val) && val >= 0) {
                        addRule({ enabled: true, type: "size", sizeOp: newRuleSizeOp, sizeValue: val });
                        setNewRuleSizeValue("");
                      }
                    }
                  }}
                  placeholder="lines"
                  className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </>
            )}

            <button
              onClick={() => {
                if (newRuleType === "keyword") {
                  if (!newRuleKeyword.trim()) return;
                  addRule({ enabled: true, type: "keyword", keyword: newRuleKeyword.trim() });
                  setNewRuleKeyword("");
                } else {
                  const val = parseInt(newRuleSizeValue, 10);
                  if (isNaN(val) || val < 0) return;
                  addRule({ enabled: true, type: "size", sizeOp: newRuleSizeOp, sizeValue: val });
                  setNewRuleSizeValue("");
                }
              }}
              disabled={
                newRuleType === "keyword"
                  ? !newRuleKeyword.trim()
                  : !newRuleSizeValue || isNaN(parseInt(newRuleSizeValue, 10))
              }
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>

        {/* Existing rules list */}
        {flagRules.length > 0 ? (
          <ul className="space-y-1">
            {flagRules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
              >
                <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${rule.enabled ? "text-red-500" : "text-muted-foreground/40"}`} />
                <span className={`flex-1 text-sm font-medium ${rule.enabled ? "text-foreground" : "text-muted-foreground line-through"}`}>
                  {rule.type === "keyword" ? (
                    <>keyword: <code className="rounded bg-muted px-1 py-0.5 text-xs">{rule.keyword}</code></>
                  ) : (
                    <>size {rule.sizeOp === "gt" ? ">" : rule.sizeOp === "lt" ? "<" : "="} {rule.sizeValue} lines</>
                  )}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {rule.type}
                </span>
                <button
                  role="switch"
                  aria-checked={rule.enabled}
                  onClick={() => toggleRule(rule.id)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
                    rule.enabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition-transform ${
                      rule.enabled ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <button
                  onClick={() => removeRule(rule.id)}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                  title="Remove rule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
            No flag rules configured. Add one above to start flagging PRs.
          </p>
        )}
      </section>

      {/* IDE Integration Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">IDE Integration</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure a local source base path to enable "Open in GoLand" buttons
          throughout the app. Repos are expected at{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{"<base>/<org>/<repo>"}</code>.
        </p>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Source base path</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Absolute path where your Git repositories are cloned.
              </p>
            </div>
            <input
              type="text"
              value={sourceBasePath}
              onChange={(e) => setSourceBasePath(e.target.value)}
              placeholder="~/source"
              className="w-56 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
