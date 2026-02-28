import { create } from "zustand";
import { GetSetting, SetSetting } from "../../wailsjs/go/services/SettingsService";
import { github } from "../../wailsjs/go/models";

// ---- Types ----

export interface FlagRule {
  id: string;
  enabled: boolean;
  type: "keyword" | "size";
  /** For keyword rules: case-insensitive match against title, body, branch, labels. */
  keyword?: string;
  /** For size rules: comparison operator. */
  sizeOp?: "gt" | "lt" | "eq";
  /** For size rules: total lines (additions + deletions) threshold. */
  sizeValue?: number;
}

const GLOBAL_KEY = "flag_rules";

function repoKey(owner: string): string {
  return `repo:${owner}:flag_rules`;
}

// ---- Store ----

interface FlagState {
  rules: FlagRule[];
  /** The repo owner that rules are currently loaded for. */
  repoOwner: string;

  /** Load persisted rules for the given owner (falls back to global). */
  loadRules: (owner?: string) => Promise<void>;
  /** Add a new rule and persist. */
  addRule: (rule: Omit<FlagRule, "id">) => Promise<void>;
  /** Remove a rule by id and persist. */
  removeRule: (id: string) => Promise<void>;
  /** Toggle a rule's enabled state and persist. */
  toggleRule: (id: string) => Promise<void>;
  /** Update a rule's fields and persist. */
  updateRule: (id: string, partial: Partial<Omit<FlagRule, "id">>) => Promise<void>;

  /** Check if a PR matches any enabled flag rule. */
  isFlagged: (pr: github.PullRequest) => boolean;
  /** Return human-readable descriptions of all matching enabled rules for a PR. */
  getFlagReasons: (pr: github.PullRequest) => string[];
}

function matchesRule(pr: github.PullRequest, rule: FlagRule): boolean {
  if (!pr || !rule.enabled) return false;

  if (rule.type === "keyword" && rule.keyword) {
    const kw = rule.keyword.toLowerCase();
    const title = (pr.title || "").toLowerCase();
    const body = (pr.body || "").toLowerCase();
    const branch = (pr.headRef || "").toLowerCase();
    const labelText = (pr.labels || []).map((l) => l?.name?.toLowerCase?.() ?? "").join(" ");
    return title.includes(kw) || body.includes(kw) || branch.includes(kw) || labelText.includes(kw);
  }

  if (rule.type === "size" && rule.sizeOp && rule.sizeValue != null) {
    const totalLines = (pr.additions || 0) + (pr.deletions || 0);
    switch (rule.sizeOp) {
      case "gt": return totalLines > rule.sizeValue;
      case "lt": return totalLines < rule.sizeValue;
      case "eq": return totalLines === rule.sizeValue;
    }
  }

  return false;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Persist rules to the repo-scoped key (and global key for compat). */
async function persistRules(owner: string, rules: FlagRule[]): Promise<void> {
  const json = JSON.stringify(rules);
  if (owner) await SetSetting(repoKey(owner), json).catch(() => {});
  await SetSetting(GLOBAL_KEY, json).catch(() => {});
}

export const useFlagStore = create<FlagState>((set, get) => ({
  rules: [],
  repoOwner: "",

  loadRules: async (owner?: string) => {
    if (owner !== undefined) set({ repoOwner: owner });
    const o = owner !== undefined ? owner : get().repoOwner;

    // Try repo-scoped key first, fall back to global.
    let raw = "";
    if (o) {
      try {
        raw = await GetSetting(repoKey(o));
      } catch { /* fall through */ }
    }
    if (!raw) {
      try {
        raw = await GetSetting(GLOBAL_KEY);
      } catch { /* ignore */ }
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as FlagRule[];
        if (Array.isArray(parsed)) {
          set({ rules: parsed });
          return;
        }
      } catch { /* invalid JSON */ }
    }
    set({ rules: [] });
  },

  addRule: async (rule) => {
    const newRule: FlagRule = { ...rule, id: generateId() };
    const next = [...get().rules, newRule];
    set({ rules: next });
    await persistRules(get().repoOwner, next);
  },

  removeRule: async (id) => {
    const next = get().rules.filter((r) => r.id !== id);
    set({ rules: next });
    await persistRules(get().repoOwner, next);
  },

  toggleRule: async (id) => {
    const next = get().rules.map((r) =>
      r.id === id ? { ...r, enabled: !r.enabled } : r,
    );
    set({ rules: next });
    await persistRules(get().repoOwner, next);
  },

  updateRule: async (id, partial) => {
    const next = get().rules.map((r) =>
      r.id === id ? { ...r, ...partial } : r,
    );
    set({ rules: next });
    await persistRules(get().repoOwner, next);
  },

  isFlagged: (pr) => {
    return get().rules.some((rule) => matchesRule(pr, rule));
  },

  getFlagReasons: (pr) => {
    return get().rules
      .filter((rule) => matchesRule(pr, rule))
      .map((rule) => {
        if (rule.type === "keyword") return `keyword: ${rule.keyword}`;
        const op = rule.sizeOp === "gt" ? ">" : rule.sizeOp === "lt" ? "<" : "=";
        return `size ${op} ${rule.sizeValue}`;
      });
  },
}));
