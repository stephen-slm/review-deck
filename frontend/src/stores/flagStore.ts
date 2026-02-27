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

const SETTING_KEY = "flag_rules";

// ---- Store ----

interface FlagState {
  rules: FlagRule[];

  /** Load persisted rules from the backend settings DB. */
  loadRules: () => Promise<void>;
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

export const useFlagStore = create<FlagState>((set, get) => ({
  rules: [],

  loadRules: async () => {
    try {
      const raw = await GetSetting(SETTING_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as FlagRule[];
        if (Array.isArray(parsed)) {
          set({ rules: parsed });
        }
      }
    } catch {
      // Setting doesn't exist yet or invalid JSON — use empty default.
    }
  },

  addRule: async (rule) => {
    const newRule: FlagRule = { ...rule, id: generateId() };
    const next = [...get().rules, newRule];
    set({ rules: next });
    await SetSetting(SETTING_KEY, JSON.stringify(next)).catch(() => {});
  },

  removeRule: async (id) => {
    const next = get().rules.filter((r) => r.id !== id);
    set({ rules: next });
    await SetSetting(SETTING_KEY, JSON.stringify(next)).catch(() => {});
  },

  toggleRule: async (id) => {
    const next = get().rules.map((r) =>
      r.id === id ? { ...r, enabled: !r.enabled } : r,
    );
    set({ rules: next });
    await SetSetting(SETTING_KEY, JSON.stringify(next)).catch(() => {});
  },

  updateRule: async (id, partial) => {
    const next = get().rules.map((r) =>
      r.id === id ? { ...r, ...partial } : r,
    );
    set({ rules: next });
    await SetSetting(SETTING_KEY, JSON.stringify(next)).catch(() => {});
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
