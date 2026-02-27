import { create } from "zustand";
import { github } from "../../wailsjs/go/models";
import {
  GetMyPRsPage,
  GetMyRecentMergedPage,
  GetReviewRequestsPage,
  GetReviewedByMePage,
  GetTeamReviewRequestsPage,
  MergePR,
  ApprovePR,
  RequestChangesPR,
  RequestReviews,
} from "../../wailsjs/go/services/PullRequestService";
import {
  GetSetting,
  SetSetting,
} from "../../wailsjs/go/services/SettingsService";

/** Default cache TTL: 5 minutes in milliseconds */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

/** How long a cached page stays valid (ms). */
const PAGE_CACHE_TTL_MS = 2 * 60 * 1000;

/** Default number of items per page */
const DEFAULT_PAGE_SIZE = 25;

export type CacheKey = "myPRs" | "myRecentMerged" | "reviewRequests" | "teamReviewRequests" | "reviewedByMe";

const CACHE_KEYS: CacheKey[] = ["myPRs", "myRecentMerged", "reviewRequests", "teamReviewRequests", "reviewedByMe"];

/** Persist a cache timestamp to the settings DB (fire-and-forget). */
function persistCacheTs(key: CacheKey, ts: number): void {
  SetSetting(`cache_ts:${key}`, String(ts)).catch(() => {});
}

export type PageDirection = "next" | "prev" | "first";

/** A single cached page of results. */
interface CachedPage {
  items: github.PullRequest[];
  pageInfo: github.PageInfo;
  fetchedAt: number;
}

export interface PaginationState {
  /** Items currently displayed (one page worth) */
  items: github.PullRequest[];
  /** Current 1-based page number */
  currentPage: number;
  /** Page size for this category */
  pageSize: number;
  /** Whether the server has more pages after the current one */
  hasNextPage: boolean;
  /** End cursor from the most recent server response */
  endCursor: string;
  /** Total result count reported by the server */
  totalCount: number;
  /**
   * Stack of cursors used to reach each page.
   * cursorStack[0] = "" (page 1), cursorStack[1] = endCursor after page 1, etc.
   * Length always equals currentPage.
   */
  cursorStack: string[];
  /** In-memory cache of previously fetched pages, keyed by page number. */
  pageCache: Record<number, CachedPage>;
}

function emptyPagination(pageSize: number = DEFAULT_PAGE_SIZE): PaginationState {
  return {
    items: [],
    currentPage: 1,
    pageSize,
    hasNextPage: false,
    endCursor: "",
    totalCount: 0,
    cursorStack: [""],
    pageCache: {},
  };
}

interface PRState {
  /** Per-category pagination state */
  pages: Record<CacheKey, PaginationState>;

  /** Loading flags */
  isLoading: Record<CacheKey, boolean>;

  /** Per-category timestamp of last successful fetch */
  lastFetchedAt: Record<CacheKey, number>;
  /** Cache TTL in milliseconds */
  cacheTTLMs: number;

  /** Node IDs of PRs the user has explicitly hidden (e.g. dismissed review requests). */
  hiddenPRs: Set<string>;

  error: string | null;

  // ---- Page navigation ----

  /** Fetch first page (resets pagination) */
  fetchMyPRs: (org: string) => Promise<void>;
  fetchMyRecentMerged: (org: string, daysBack?: number) => Promise<void>;
  fetchReviewRequests: (org: string) => Promise<void>;
  fetchTeamReviewRequests: (org: string, team: string) => Promise<void>;
  fetchReviewedByMe: (org: string) => Promise<void>;

  /** Navigate to a different page */
  goToPageMyPRs: (org: string, direction: PageDirection) => Promise<void>;
  goToPageMyRecentMerged: (org: string, direction: PageDirection, daysBack?: number) => Promise<void>;
  goToPageReviewRequests: (org: string, direction: PageDirection) => Promise<void>;
  goToPageReviewedByMe: (org: string, direction: PageDirection) => Promise<void>;

  /** Change page size and re-fetch from page 1 */
  setPageSize: (key: CacheKey, size: number, refetch?: () => Promise<void>) => void;

  // ---- Shared helpers ----

  /** Fetch only if cache is stale for the given category */
  fetchIfStale: (key: CacheKey, fetcher: () => Promise<void>) => Promise<void>;
  /** Force-fetch all categories (serialized for rate limits) */
  fetchAll: (orgs: string[], force?: boolean) => Promise<void>;

  // ---- Actions ----
  mergePR: (prNodeID: string, method: string) => Promise<string>;
  approvePR: (prNodeID: string, body?: string) => Promise<void>;
  requestChangesPR: (prNodeID: string, body: string) => Promise<void>;
  requestReviews: (prNodeID: string, userIDs: string[], teamIDs: string[]) => Promise<void>;

  /**
   * Fetch the next server page and APPEND its items to the current page's items.
   * Used to backfill when client-side filters (drafts, stacked, hidden) reduce
   * the visible row count below the page size.
   */
  appendNextPage: (key: CacheKey, fetcher: (pageSize: number, cursor: string) => Promise<github.PRPage>) => Promise<void>;

  /** Load persisted cache timestamps from the DB so fetchIfStale works across restarts */
  loadCacheTimestamps: () => Promise<void>;
  setCacheTTL: (ms: number) => void;
  clearError: () => void;

  /** Reset all pages and cache timestamps. Called when the selected repo changes. */
  resetPages: () => void;

  // ---- Hidden PRs ----
  hidePR: (nodeId: string) => void;
  unhidePR: (nodeId: string) => void;
  loadHiddenPRs: () => Promise<void>;
}

function isFresh(lastFetchedAt: number, ttl: number): boolean {
  return Date.now() - lastFetchedAt < ttl;
}

const defaultPages: Record<CacheKey, PaginationState> = {
  myPRs: emptyPagination(),
  myRecentMerged: emptyPagination(),
  reviewRequests: emptyPagination(),
  teamReviewRequests: emptyPagination(),
  reviewedByMe: emptyPagination(),
};

const defaultLoading: Record<CacheKey, boolean> = {
  myPRs: false,
  myRecentMerged: false,
  reviewRequests: false,
  teamReviewRequests: false,
  reviewedByMe: false,
};

const defaultLastFetched: Record<CacheKey, number> = {
  myPRs: 0,
  myRecentMerged: 0,
  reviewRequests: 0,
  teamReviewRequests: 0,
  reviewedByMe: 0,
};

/**
 * Helper: given the current pagination state and a direction, return the
 * cursor to use for the next fetch and the new cursorStack / currentPage.
 */
function resolveNavigation(
  pg: PaginationState,
  direction: PageDirection,
): { cursor: string; newPage: number; newStack: string[] } | null {
  switch (direction) {
    case "first":
      return { cursor: "", newPage: 1, newStack: [""] };
    case "next": {
      if (!pg.hasNextPage) return null;
      const newStack = [...pg.cursorStack, pg.endCursor];
      return { cursor: pg.endCursor, newPage: pg.currentPage + 1, newStack };
    }
    case "prev": {
      if (pg.currentPage <= 1) return null;
      const newStack = pg.cursorStack.slice(0, -1);
      const cursor = newStack[newStack.length - 1] ?? "";
      return { cursor, newPage: pg.currentPage - 1, newStack };
    }
  }
}

/** Apply a server response to produce an updated PaginationState, caching the page. */
function applyPageResult(
  prev: PaginationState,
  prs: github.PullRequest[],
  info: github.PageInfo,
  newPage: number,
  newStack: string[],
): PaginationState {
  return {
    ...prev,
    items: prs,
    currentPage: newPage,
    cursorStack: newStack,
    hasNextPage: info.hasNextPage,
    endCursor: info.endCursor,
    totalCount: info.totalCount,
    pageCache: {
      ...prev.pageCache,
      [newPage]: { items: prs, pageInfo: info, fetchedAt: Date.now() },
    },
  };
}

/** Look up a cached page; returns it only if it exists and hasn't expired. */
function getCachedPage(pg: PaginationState, page: number): CachedPage | null {
  const cached = pg.pageCache[page];
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > PAGE_CACHE_TTL_MS) return null;
  return cached;
}

/** Apply a cached page hit (no server fetch needed). */
function applyCachedPage(
  prev: PaginationState,
  cached: CachedPage,
  newPage: number,
  newStack: string[],
): PaginationState {
  return {
    ...prev,
    items: cached.items,
    currentPage: newPage,
    cursorStack: newStack,
    hasNextPage: cached.pageInfo.hasNextPage,
    endCursor: cached.pageInfo.endCursor,
    totalCount: cached.pageInfo.totalCount,
  };
}

/**
 * Returns ALL items for a category by collecting items from every page in the
 * page cache. This gives the complete dataset (populated by the poller) rather
 * than just the currently displayed page.
 */
export function getAllItems(key: CacheKey): github.PullRequest[] {
  const pg = usePRStore.getState().pages[key];
  const cache = pg.pageCache;
  const pageNumbers = Object.keys(cache).map(Number).sort((a, b) => a - b);
  if (pageNumbers.length === 0) return pg.items;
  const all: github.PullRequest[] = [];
  for (const p of pageNumbers) {
    all.push(...cache[p].items);
  }
  return all;
}

export const usePRStore = create<PRState>((set, get) => ({
  pages: { ...defaultPages },
  isLoading: { ...defaultLoading },
  lastFetchedAt: { ...defaultLastFetched },
  cacheTTLMs: DEFAULT_CACHE_TTL_MS,
  hiddenPRs: new Set<string>(),
  error: null,

  // ---- First-page fetches (reset pagination to page 1) ----

  fetchMyPRs: async (org: string) => {
    const pageSize = get().pages.myPRs.pageSize;
    set((s) => ({ isLoading: { ...s.isLoading, myPRs: true }, error: null }));
    try {
      const page = await GetMyPRsPage(org, pageSize, "");
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      const now = Date.now();
      set((s) => ({
        pages: { ...s.pages, myPRs: { ...applyPageResult({ ...s.pages.myPRs, pageCache: {} }, prs, info, 1, [""]) } },
        isLoading: { ...s.isLoading, myPRs: false },
        lastFetchedAt: { ...s.lastFetchedAt, myPRs: now },
      }));
      persistCacheTs("myPRs", now);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ isLoading: { ...s.isLoading, myPRs: false }, error: message }));
    }
  },

  fetchMyRecentMerged: async (org: string, daysBack = 14) => {
    const pageSize = get().pages.myRecentMerged.pageSize;
    set((s) => ({ isLoading: { ...s.isLoading, myRecentMerged: true }, error: null }));
    try {
      const page = await GetMyRecentMergedPage(org, daysBack, pageSize, "");
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      const now = Date.now();
      set((s) => ({
        pages: { ...s.pages, myRecentMerged: { ...applyPageResult({ ...s.pages.myRecentMerged, pageCache: {} }, prs, info, 1, [""]) } },
        isLoading: { ...s.isLoading, myRecentMerged: false },
        lastFetchedAt: { ...s.lastFetchedAt, myRecentMerged: now },
      }));
      persistCacheTs("myRecentMerged", now);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ isLoading: { ...s.isLoading, myRecentMerged: false }, error: message }));
    }
  },

  fetchReviewRequests: async (org: string) => {
    const pageSize = get().pages.reviewRequests.pageSize;
    set((s) => ({ isLoading: { ...s.isLoading, reviewRequests: true }, error: null }));
    try {
      const page = await GetReviewRequestsPage(org, pageSize, "");
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      const now = Date.now();
      set((s) => ({
        pages: { ...s.pages, reviewRequests: { ...applyPageResult({ ...s.pages.reviewRequests, pageCache: {} }, prs, info, 1, [""]) } },
        isLoading: { ...s.isLoading, reviewRequests: false },
        lastFetchedAt: { ...s.lastFetchedAt, reviewRequests: now },
      }));
      persistCacheTs("reviewRequests", now);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ isLoading: { ...s.isLoading, reviewRequests: false }, error: message }));
    }
  },

  fetchTeamReviewRequests: async (org: string, team: string) => {
    const pageSize = get().pages.teamReviewRequests.pageSize;
    set((s) => ({ isLoading: { ...s.isLoading, teamReviewRequests: true }, error: null }));
    try {
      const page = await GetTeamReviewRequestsPage(org, team, pageSize, "");
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      const now = Date.now();
      set((s) => ({
        pages: { ...s.pages, teamReviewRequests: { ...applyPageResult({ ...s.pages.teamReviewRequests, pageCache: {} }, prs, info, 1, [""]) } },
        isLoading: { ...s.isLoading, teamReviewRequests: false },
        lastFetchedAt: { ...s.lastFetchedAt, teamReviewRequests: now },
      }));
      persistCacheTs("teamReviewRequests", now);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ isLoading: { ...s.isLoading, teamReviewRequests: false }, error: message }));
    }
  },

  fetchReviewedByMe: async (org: string) => {
    const pageSize = get().pages.reviewedByMe.pageSize;
    set((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: true }, error: null }));
    try {
      const page = await GetReviewedByMePage(org, pageSize, "");
      const prs = page.pullRequests || [];
      const info = page.pageInfo;
      const now = Date.now();
      set((s) => ({
        pages: { ...s.pages, reviewedByMe: { ...applyPageResult({ ...s.pages.reviewedByMe, pageCache: {} }, prs, info, 1, [""]) } },
        isLoading: { ...s.isLoading, reviewedByMe: false },
        lastFetchedAt: { ...s.lastFetchedAt, reviewedByMe: now },
      }));
      persistCacheTs("reviewedByMe", now);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: false }, error: message }));
    }
  },

  // ---- Page navigation ----

  goToPageMyPRs: async (org: string, direction: PageDirection) => {
    const pg = get().pages.myPRs;
    const nav = resolveNavigation(pg, direction);
    if (!nav) return;
    const cached = getCachedPage(pg, nav.newPage);
    if (cached) {
      set((s) => ({ pages: { ...s.pages, myPRs: applyCachedPage(s.pages.myPRs, cached, nav.newPage, nav.newStack) } }));
      return;
    }
    set((s) => ({ isLoading: { ...s.isLoading, myPRs: true }, error: null }));
    try {
      const page = await GetMyPRsPage(org, pg.pageSize, nav.cursor);
      const prs = page.pullRequests || [];
      set((s) => ({
        pages: { ...s.pages, myPRs: applyPageResult(s.pages.myPRs, prs, page.pageInfo, nav.newPage, nav.newStack) },
        isLoading: { ...s.isLoading, myPRs: false },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ isLoading: { ...s.isLoading, myPRs: false }, error: message }));
    }
  },

  goToPageMyRecentMerged: async (org: string, direction: PageDirection, daysBack = 14) => {
    const pg = get().pages.myRecentMerged;
    const nav = resolveNavigation(pg, direction);
    if (!nav) return;
    const cached = getCachedPage(pg, nav.newPage);
    if (cached) {
      set((s) => ({ pages: { ...s.pages, myRecentMerged: applyCachedPage(s.pages.myRecentMerged, cached, nav.newPage, nav.newStack) } }));
      return;
    }
    set((s) => ({ isLoading: { ...s.isLoading, myRecentMerged: true }, error: null }));
    try {
      const page = await GetMyRecentMergedPage(org, daysBack, pg.pageSize, nav.cursor);
      const prs = page.pullRequests || [];
      set((s) => ({
        pages: { ...s.pages, myRecentMerged: applyPageResult(s.pages.myRecentMerged, prs, page.pageInfo, nav.newPage, nav.newStack) },
        isLoading: { ...s.isLoading, myRecentMerged: false },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ isLoading: { ...s.isLoading, myRecentMerged: false }, error: message }));
    }
  },

  goToPageReviewRequests: async (org: string, direction: PageDirection) => {
    const pg = get().pages.reviewRequests;
    const nav = resolveNavigation(pg, direction);
    if (!nav) return;
    const cached = getCachedPage(pg, nav.newPage);
    if (cached) {
      set((s) => ({ pages: { ...s.pages, reviewRequests: applyCachedPage(s.pages.reviewRequests, cached, nav.newPage, nav.newStack) } }));
      return;
    }
    set((s) => ({ isLoading: { ...s.isLoading, reviewRequests: true }, error: null }));
    try {
      const page = await GetReviewRequestsPage(org, pg.pageSize, nav.cursor);
      const prs = page.pullRequests || [];
      set((s) => ({
        pages: { ...s.pages, reviewRequests: applyPageResult(s.pages.reviewRequests, prs, page.pageInfo, nav.newPage, nav.newStack) },
        isLoading: { ...s.isLoading, reviewRequests: false },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ isLoading: { ...s.isLoading, reviewRequests: false }, error: message }));
    }
  },

  goToPageReviewedByMe: async (org: string, direction: PageDirection) => {
    const pg = get().pages.reviewedByMe;
    const nav = resolveNavigation(pg, direction);
    if (!nav) return;
    const cached = getCachedPage(pg, nav.newPage);
    if (cached) {
      set((s) => ({ pages: { ...s.pages, reviewedByMe: applyCachedPage(s.pages.reviewedByMe, cached, nav.newPage, nav.newStack) } }));
      return;
    }
    set((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: true }, error: null }));
    try {
      const page = await GetReviewedByMePage(org, pg.pageSize, nav.cursor);
      const prs = page.pullRequests || [];
      set((s) => ({
        pages: { ...s.pages, reviewedByMe: applyPageResult(s.pages.reviewedByMe, prs, page.pageInfo, nav.newPage, nav.newStack) },
        isLoading: { ...s.isLoading, reviewedByMe: false },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ isLoading: { ...s.isLoading, reviewedByMe: false }, error: message }));
    }
  },

  setPageSize: (key: CacheKey, size: number, refetch?: () => Promise<void>) => {
    set((s) => ({
      pages: {
        ...s.pages,
        [key]: { ...emptyPagination(size) },
      },
    }));
    // Re-fetch from page 1 with new size if a refetch callback is provided.
    if (refetch) refetch();
  },

  // ---- Shared ----

  fetchIfStale: async (key: CacheKey, fetcher: () => Promise<void>) => {
    const { lastFetchedAt, cacheTTLMs } = get();
    if (isFresh(lastFetchedAt[key], cacheTTLMs)) return;
    await fetcher();
  },

  fetchAll: async (orgs: string[], force = false) => {
    const state = get();
    state.clearError();
    for (const org of orgs) {
      if (force || !isFresh(state.lastFetchedAt.myPRs, state.cacheTTLMs)) {
        await state.fetchMyPRs(org);
      }
      if (force || !isFresh(state.lastFetchedAt.reviewRequests, state.cacheTTLMs)) {
        await state.fetchReviewRequests(org);
      }
      if (force || !isFresh(state.lastFetchedAt.reviewedByMe, state.cacheTTLMs)) {
        await state.fetchReviewedByMe(org);
      }
      if (force || !isFresh(state.lastFetchedAt.myRecentMerged, state.cacheTTLMs)) {
        await state.fetchMyRecentMerged(org);
      }
    }
  },

  mergePR: async (prNodeID: string, method: string) => {
    try {
      return await MergePR(prNodeID, method);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  approvePR: async (prNodeID: string, body = "") => {
    try {
      await ApprovePR(prNodeID, body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  requestChangesPR: async (prNodeID: string, body: string) => {
    try {
      await RequestChangesPR(prNodeID, body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  requestReviews: async (prNodeID: string, userIDs: string[], teamIDs: string[]) => {
    try {
      await RequestReviews(prNodeID, userIDs, teamIDs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  loadCacheTimestamps: async () => {
    const timestamps: Partial<Record<CacheKey, number>> = {};
    await Promise.all(
      CACHE_KEYS.map(async (key) => {
        try {
          const val = await GetSetting(`cache_ts:${key}`);
          const ts = parseInt(val, 10);
          if (!isNaN(ts) && ts > 0) {
            timestamps[key] = ts;
          }
        } catch {
          // Setting doesn't exist yet — leave at 0 (will trigger fetch).
        }
      }),
    );
    set((s) => ({
      lastFetchedAt: { ...s.lastFetchedAt, ...timestamps },
    }));
  },

  appendNextPage: async (key, fetcher) => {
    const pg = get().pages[key];
    if (!pg.hasNextPage || get().isLoading[key]) return;
    // Guard against fake poller cursors (e.g. "poller-1") being sent to the API.
    const cursor = pg.endCursor.startsWith("poller-") ? "" : pg.endCursor;
    set((s) => ({ isLoading: { ...s.isLoading, [key]: true } }));
    try {
      const page = await fetcher(pg.pageSize, cursor);
      const prs = page.pullRequests || [];
      set((s) => {
        const cur = s.pages[key];
        const newItems = [...cur.items, ...prs.filter((p) => !cur.items.some((e) => e.nodeId === p.nodeId))];
        return {
          pages: {
            ...s.pages,
            [key]: {
              ...cur,
              items: newItems,
              hasNextPage: page.pageInfo.hasNextPage,
              endCursor: page.pageInfo.endCursor,
              totalCount: page.pageInfo.totalCount,
              // Update the current page cache so the grown result persists across navigation.
              pageCache: {
                ...cur.pageCache,
                [cur.currentPage]: {
                  items: newItems,
                  pageInfo: page.pageInfo,
                  fetchedAt: Date.now(),
                },
              },
            },
          },
          isLoading: { ...s.isLoading, [key]: false },
        };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({ isLoading: { ...s.isLoading, [key]: false }, error: message }));
    }
  },

  setCacheTTL: (ms: number) => set({ cacheTTLMs: ms }),
  clearError: () => set({ error: null }),

  resetPages: () =>
    set({
      pages: {
        myPRs: emptyPagination(get().pages.myPRs.pageSize),
        myRecentMerged: emptyPagination(get().pages.myRecentMerged.pageSize),
        reviewRequests: emptyPagination(get().pages.reviewRequests.pageSize),
        teamReviewRequests: emptyPagination(get().pages.teamReviewRequests.pageSize),
        reviewedByMe: emptyPagination(get().pages.reviewedByMe.pageSize),
      },
      lastFetchedAt: { ...defaultLastFetched },
      error: null,
    }),

  // ---- Hidden PRs (persisted as JSON array of nodeIds) ----

  hidePR: (nodeId: string) => {
    const next = new Set(get().hiddenPRs);
    next.add(nodeId);
    set({ hiddenPRs: next });
    SetSetting("hidden_prs", JSON.stringify(Array.from(next))).catch(() => {});
  },

  unhidePR: (nodeId: string) => {
    const next = new Set(get().hiddenPRs);
    next.delete(nodeId);
    set({ hiddenPRs: next });
    SetSetting("hidden_prs", JSON.stringify(Array.from(next))).catch(() => {});
  },

  loadHiddenPRs: async () => {
    try {
      const val = await GetSetting("hidden_prs");
      const arr = JSON.parse(val);
      if (Array.isArray(arr)) {
        set({ hiddenPRs: new Set(arr) });
      }
    } catch {
      // Setting doesn't exist yet — start with empty set.
    }
  },
}));
