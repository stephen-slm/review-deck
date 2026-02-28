import { useState, useEffect, useMemo } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRepoStore } from "@/stores/repoStore";
import { useVimStore } from "@/stores/vimStore";

import { Plus, Trash2, Bot, Users, RefreshCw, Star, ChevronUp, ChevronDown, FolderGit2, AlertTriangle, Shield, Crown } from "lucide-react";
import { GetOrgMembers } from "../../wailsjs/go/services/PullRequestService";
import { github } from "../../wailsjs/go/models";
import { useFlagStore } from "@/stores/flagStore";

type RepoSettingsTab = "filters" | "teams" | "rules";

interface TabDef { key: RepoSettingsTab; label: string; icon: typeof FolderGit2 }

const repoTabs: TabDef[] = [
  { key: "filters", label: "Filters", icon: Bot },
  { key: "teams", label: "Teams & Priority", icon: Crown },
  { key: "rules", label: "Flag Rules", icon: AlertTriangle },
];

export function SettingsPage() {
  const { isAuthenticated } = useAuthStore();
  const { loadOrgs, loadRepoSettings, filterBots, setFilterBots, hideStackedPRs, setHideStackedPRs, hideDraftPRs, setHideDraftPRs, filteredCommentUsers, setFilteredCommentUsers, filteredReviewUsers, setFilteredReviewUsers, teamsByOrg, loadAllTeams, syncTeams, setTeamEnabled, prioritiesByOrg, loadAllPriorities, addPriority, removePriority, movePriority } = useSettingsStore();
  const { repos, loadRepos } = useRepoStore();

  // Derive unique org names from tracked repos for team/priority features.
  const derivedOrgs = useMemo(() => {
    const owners = new Set(repos.map((r) => r.repoOwner));
    return Array.from(owners).sort();
  }, [repos]);

  const [activeTab, setActiveTab] = useState<RepoSettingsTab>("filters");
  const [syncingOrg, setSyncingOrg] = useState<string | null>(null);
  const [newPriorityName, setNewPriorityName] = useState("");
  const [newPriorityType, setNewPriorityType] = useState<"user" | "team">("user");

  const [membersByOrg, setMembersByOrg] = useState<Record<string, github.User[]>>({});
  const [showPrioritySuggestions, setShowPrioritySuggestions] = useState(false);

  // Filtered users input state
  const [newFilteredCommentUser, setNewFilteredCommentUser] = useState("");
  const [newFilteredReviewUser, setNewFilteredReviewUser] = useState("");

  // Flag rules state
  const { rules: flagRules, loadRules: loadFlagRules, addRule, removeRule, toggleRule } = useFlagStore();
  const [newRuleType, setNewRuleType] = useState<"keyword" | "size">("keyword");
  const [newRuleKeyword, setNewRuleKeyword] = useState("");
  const [newRuleSizeOp, setNewRuleSizeOp] = useState<"gt" | "lt" | "eq">("gt");
  const [newRuleSizeValue, setNewRuleSizeValue] = useState("");

  const selectedRepo = useRepoStore((s) => s.selectedRepo);

  // Load repos and orgs on mount.
  useEffect(() => {
    loadRepos();
    loadOrgs();
  }, [loadRepos, loadOrgs]);

  // Reload repo-scoped settings (filters, flag rules) when selected repo changes.
  useEffect(() => {
    const owner = selectedRepo?.repoOwner || "";
    loadRepoSettings(owner);
    loadFlagRules(owner);
  }, [selectedRepo?.repoOwner, loadRepoSettings, loadFlagRules]);

  // Register vim keybindings: j/k scroll, h/l and 1-4 switch tabs.
  useEffect(() => {
    const scrollEl = document.getElementById("scroll-region");
    const tabKeys: RepoSettingsTab[] = repoTabs.map((t) => t.key);
    const currentIdx = tabKeys.indexOf(activeTab);

    useVimStore.getState().registerActions({
      onMoveDown: () => scrollEl?.scrollBy(0, 150),
      onMoveUp: () => scrollEl?.scrollBy(0, -150),
      onTabNext: () => setActiveTab(tabKeys[(currentIdx + 1) % tabKeys.length]),
      onTabPrev: () => setActiveTab(tabKeys[(currentIdx - 1 + tabKeys.length) % tabKeys.length]),
      onTabDirect: (idx: number) => {
        if (idx >= 0 && idx < tabKeys.length) setActiveTab(tabKeys[idx]);
      },
    });
    return () => useVimStore.getState().clearActions();
  }); // no deps — re-registers each render with fresh closures for activeTab

  // Load teams and priorities for all derived orgs once repos are loaded; sync teams from GitHub if none cached yet.
  useEffect(() => {
    if (derivedOrgs.length === 0) return;
    loadAllTeams().then(() => {
      const current = useSettingsStore.getState().teamsByOrg;
      for (const org of derivedOrgs) {
        if (!current[org] || current[org].length === 0) {
          syncTeams(org);
        }
      }
    });
    loadAllPriorities();
    // Load cached org members for priority autocomplete.
    for (const org of derivedOrgs) {
      GetOrgMembers(org).then((members) => {
        setMembersByOrg((prev) => ({ ...prev, [org]: members || [] }));
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedOrgs]);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Repo Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure per-repository settings for the selected repo{selectedRepo ? ` (${selectedRepo.repoOwner}/${selectedRepo.repoName})` : ""}.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-end gap-0.5 border-b border-border overflow-x-auto">
        <div className="flex gap-0.5">
          {repoTabs.map((tab, ti) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative inline-flex shrink-0 items-center gap-1 px-2.5 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              <kbd className="ml-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground/60">
                {ti + 1}
              </kbd>
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {activeTab === "filters" && (
          <>
            {/* Filters Section */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
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

              </div>
            </section>

            {/* Filtered Comment Users */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Filtered Comment Users</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Comments and review threads authored by these users are hidden on the
                PR detail page Discussion tab.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFilteredCommentUser}
                  onChange={(e) => setNewFilteredCommentUser(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFilteredCommentUser.trim()) {
                      const user = newFilteredCommentUser.trim();
                      if (!filteredCommentUsers.includes(user)) {
                        setFilteredCommentUsers([...filteredCommentUsers, user]);
                      }
                      setNewFilteredCommentUser("");
                    }
                  }}
                  placeholder="e.g. copilot-pull-request-reviewer[bot]"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => {
                    const user = newFilteredCommentUser.trim();
                    if (!user) return;
                    if (!filteredCommentUsers.includes(user)) {
                      setFilteredCommentUsers([...filteredCommentUsers, user]);
                    }
                    setNewFilteredCommentUser("");
                  }}
                  disabled={!newFilteredCommentUser.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>

              {filteredCommentUsers.length > 0 ? (
                <ul className="space-y-1">
                  {filteredCommentUsers.map((user) => (
                    <li
                      key={user}
                      className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2"
                    >
                      <span className="text-sm text-foreground">{user}</span>
                      <button
                        onClick={() =>
                          setFilteredCommentUsers(
                            filteredCommentUsers.filter((u) => u !== user),
                          )
                        }
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
                  No users filtered. All comments will be shown.
                </p>
              )}
            </section>

            {/* Filtered Review Users */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Filtered Review Users</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Reviews authored by these users are hidden from the PR detail page
                Reviews section and Reviewers sidebar.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFilteredReviewUser}
                  onChange={(e) => setNewFilteredReviewUser(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFilteredReviewUser.trim()) {
                      const user = newFilteredReviewUser.trim();
                      if (!filteredReviewUsers.includes(user)) {
                        setFilteredReviewUsers([...filteredReviewUsers, user]);
                      }
                      setNewFilteredReviewUser("");
                    }
                  }}
                  placeholder="e.g. github-actions[bot]"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => {
                    const user = newFilteredReviewUser.trim();
                    if (!user) return;
                    if (!filteredReviewUsers.includes(user)) {
                      setFilteredReviewUsers([...filteredReviewUsers, user]);
                    }
                    setNewFilteredReviewUser("");
                  }}
                  disabled={!newFilteredReviewUser.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>

              {filteredReviewUsers.length > 0 ? (
                <ul className="space-y-1">
                  {filteredReviewUsers.map((user) => (
                    <li
                      key={user}
                      className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-2"
                    >
                      <span className="text-sm text-foreground">{user}</span>
                      <button
                        onClick={() =>
                          setFilteredReviewUsers(
                            filteredReviewUsers.filter((u) => u !== user),
                          )
                        }
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
                  No users filtered. All reviews will be shown.
                </p>
              )}
            </section>
          </>
        )}

        {activeTab === "teams" && (
          <>
            {/* Teams Section */}
            {isAuthenticated && derivedOrgs.length > 0 ? (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Teams</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enable the teams whose review requests you want to track. Disabled
                  teams are excluded from the poller and team review request views.
                </p>

                {derivedOrgs.map((org) => {
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
            ) : (
              <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Connect your GitHub account and add an organization to manage teams.
              </p>
            )}

            {/* Priority Reviewers Section */}
            {isAuthenticated && derivedOrgs.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Priority Reviewers</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  PRs from prioritised users or teams are surfaced first in the Review
                  Requests view and marked with a visual indicator.
                </p>

                {derivedOrgs.map((org) => {
                  const priorities = prioritiesByOrg[org] || [];
                  const existingNames = new Set(priorities.map((p) => p.name));
                  const q = newPriorityName.toLowerCase();
                  let suggestions: { name: string; label: string; avatar: string }[];
                  if (newPriorityType === "team") {
                    suggestions = (teamsByOrg[org] || [])
                      .filter((t) => !existingNames.has(t.teamSlug) && (q.length === 0 || t.teamSlug.toLowerCase().includes(q) || t.teamName.toLowerCase().includes(q)))
                      .slice(0, 10)
                      .map((t) => ({ name: t.teamSlug, label: t.teamName, avatar: "" }));
                  } else {
                    suggestions = (membersByOrg[org] || [])
                      .filter((u) => !existingNames.has(u.login) && (q.length === 0 || u.login.toLowerCase().includes(q) || (u.name && u.name.toLowerCase().includes(q))))
                      .slice(0, 10)
                      .map((u) => ({ name: u.login, label: u.name || u.login, avatar: u.avatarUrl || "" }));
                  }
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
          </>
        )}

        {activeTab === "rules" && (
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
                <button
                  type="button"
                  onClick={() => {
                    setNewRuleType((prev) => {
                      const next = prev === "keyword" ? "size" : "keyword";
                      setNewRuleKeyword("");
                      setNewRuleSizeValue("");
                      return next;
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  title={`Switch to ${newRuleType === "keyword" ? "Size" : "Keyword"} rule`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {newRuleType === "keyword" ? "Keyword" : "Size"}
                </button>

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
                    <button
                      type="button"
                      onClick={() => {
                        setNewRuleSizeOp((prev) => {
                          if (prev === "gt") return "lt";
                          if (prev === "lt") return "eq";
                          return "gt";
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      title="Click to cycle: &gt; / &lt; / ="
                    >
                      {newRuleSizeOp === "gt" ? "> greater than" : newRuleSizeOp === "lt" ? "< less than" : "= equal to"}
                    </button>
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
        )}
      </div>
    </div>
  );
}
