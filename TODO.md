# Review Deck - TODO

## Active


## Backlog

---

### Priority Review List
**Priority:** Medium

Add a configurable priority list of people and/or teams whose review requests are surfaced first. PRs from prioritised authors or teams should be visually distinguished (e.g. pinned to the top of the Review Requests view, highlighted badge) so the user can triage their review queue by importance.

**Tasks:**
- [ ] New SQLite table `review_priorities`: `id`, `org_name`, `name TEXT` (login or team slug), `type TEXT` ("user" or "team"), `priority INTEGER DEFAULT 0` (higher = more important), `created_at DATETIME`
- [ ] Storage methods: `GetReviewPriorities(org)`, `AddReviewPriority(org, name, type)`, `RemoveReviewPriority(org, name, type)`, `UpdateReviewPriorityOrder(org, name, type, priority)`
- [ ] Expose via `SettingsService` (or a new `PriorityService`): same CRUD methods bound through Wails
- [ ] Settings UI section in `SettingsPage.tsx`:
  - "Priority reviewers" card per tracked org
  - Add input with type selector (user / team), autocomplete from cached org members and viewer teams
  - Draggable reorder list or up/down arrows to set relative priority
  - Remove button per entry
- [ ] Frontend sorting logic:
  - In the Review Requests view, sort PRs so those authored by (or review-requested by) a priority person/team appear first
  - Add a visual indicator (pin icon, coloured left border, or "Priority" badge) on priority-matched rows in `PRTable`
- [ ] Store integration: load priorities into `settingsStore` (or a new `priorityStore`) on app start, expose a `isPriority(author)` helper for the UI
- [ ] Consider extending to "My PRs" view as well: highlight PRs where a priority reviewer has been requested but hasn't responded yet

---

### Header Click to Fullscreen
**Priority:** Low

Clicking the app header/titlebar area should toggle the window to fullscreen mode. Wails exposes `WindowFullscreen()` and `WindowUnfullscreen()` (or `WindowToggleMaximise()`) via the runtime JS bindings. Wire a click handler on the header/titlebar region in `Sidebar.tsx` (the "Review Deck" heading) or the drag region spacer to call the appropriate Wails runtime method.

**Tasks:**
- [ ] Add click handler to the header element that calls `WindowToggleMaximise()` from `wailsjs/runtime/runtime`
- [ ] Ensure double-click vs single-click behaviour is correct (macOS convention is double-click titlebar to zoom)

---

---

### Filter Out Repositories
**Priority:** High

Allow users to exclude specific repositories from all PR views. Currently the app fetches PRs across an entire org with no repo-level filtering.

**Tasks:**
- [ ] Add a `filtered_repos` table in SQLite (new migration): `id`, `org_name`, `repo_name`, `excluded INTEGER DEFAULT 1`
- [ ] Add storage methods: `GetExcludedRepos(org)`, `AddExcludedRepo(org, repo)`, `RemoveExcludedRepo(org, repo)`
- [ ] Expose via `SettingsService`: `GetExcludedRepos(org)`, `AddExcludedRepo(org, repo)`, `RemoveExcludedRepo(org, repo)`
- [ ] Apply filtering -- two options:
  - **Option A (query-time):** Append `-repo:org/name` qualifiers to the GitHub search queries. Limited by GitHub's query length but simplest approach.
  - **Option B (client-side):** Filter out excluded repos after fetching, before storing/returning. Works regardless of count but wastes API quota.
  - Recommend Option A with fallback to Option B if the exclusion list is long (>10 repos)
- [ ] Add UI in `SettingsPage.tsx` under each tracked org: a list of excluded repos with add/remove, possibly with autocomplete from repos seen in cached PR data
- [ ] Apply the same filtering in the poller

---

---

### Complete Assignee Implementation with Cached Org Members
**Priority:** High

The current `ReviewerAssign` component calls `SearchOrgMembers` on every keystroke (debounced 300ms), hitting the GitHub API each time. Replace this with a locally cached member list that refreshes weekly.

**Tasks:**
- [ ] New migration: `org_members` table -- `id`, `org_name`, `node_id TEXT`, `login TEXT`, `name TEXT`, `avatar_url TEXT`, `last_synced_at DATETIME`
- [ ] Add storage methods: `UpsertOrgMembers(org, []User)`, `GetOrgMembers(org)`, `GetOrgMembersLastSync(org)`
- [ ] New GitHub API call to fetch all org members -- use the REST API `GET /orgs/{org}/members` (paginated, up to 100 per page) or GraphQL `organization.membersWithRole`. Store the full list locally.
- [ ] Add a `SyncOrgMembers(org)` method in `PullRequestService` (or a new `OrgService`) that:
  - Checks `last_synced_at` -- if <7 days old, skip
  - Fetches all members from GitHub API
  - Upserts into `org_members`
- [ ] Trigger the sync: on app startup (if stale), on org add, and optionally on a manual "Refresh members" button in Settings
- [ ] Have the poller also trigger the sync once per cycle if stale
- [ ] Update `ReviewerAssign.tsx` to:
  - On dropdown open, load the full cached member list from `GetOrgMembers(org)` (via a new Wails-bound method)
  - Filter client-side as the user types (no API calls per keystroke)
  - Fall back to `SearchOrgMembers` API call only if the cache is empty
- [ ] Expose `GetOrgMembers(org)` and `SyncOrgMembers(org)` via Wails bindings

---

---

### Theme Support
**Priority:** Low
**Reference:** [opencode theme system](https://github.com/anomalyco/opencode/tree/dev/packages/ui/src/theme)

Add a theme engine inspired by opencode's approach. The app currently has a single hard-coded dark theme (zinc/neutral palette via Tailwind CSS variables). The goal is to support multiple themes with light/dark variants and a settings UI to switch between them.

**opencode's architecture (for reference):**
- `types.ts` -- defines `DesktopTheme` with `light`/`dark` `ThemeVariant`s, each containing `seeds` (9 seed hex colors: neutral, primary, success, warning, error, info, interactive, diffAdd, diffDelete) plus optional `overrides`
- `color.ts` -- OKLCH color space utilities: hex/rgb/oklch conversions, `generateScale()` (12-step lightness ramp from a seed), `generateNeutralScale()`, alpha blending, mix/lighten/darken
- `resolve.ts` -- `resolveThemeVariant(variant, isDark)` takes seeds + overrides and generates ~200 CSS custom property tokens (background, surface, text, border, icon, input, button, syntax, markdown, diff, avatar categories). `themeToCss()` serialises tokens to `--key: value;` strings
- `loader.ts` -- injects a `<style id="oc-theme">` element into `<head>`, sets `data-theme` and `data-color-scheme` attributes on `<html>`, supports loading themes from URL
- `context.tsx` -- SolidJS context (we'd use React/zustand) providing `setTheme(id)`, `setColorScheme("light"|"dark"|"system")`, theme preview/commit/cancel, persists selection in localStorage
- `default-themes.ts` -- imports 16 bundled theme JSON files (dracula, nord, catppuccin, solarized, tokyonight, etc.)
- `themes/*.json` -- each theme is a JSON file with `{name, id, light: {seeds, overrides}, dark: {seeds, overrides}}`

**Adaptation plan for Review Deck:**

1. **Define theme types** (`frontend/src/theme/types.ts`)
   - Simplified `DesktopTheme` type with `light`/`dark` variants
   - Seed colors map to our existing Tailwind CSS variable names (background, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, foreground and their `-foreground` counterparts)
   - Much simpler than opencode -- we only need ~25 tokens matching our current CSS variables, not 200

2. **Color utilities** (`frontend/src/theme/color.ts`)
   - Port the hex-to-oklch and scale generation from opencode
   - Alternatively, keep it simpler: define themes as direct CSS variable maps (no generation) since we have far fewer tokens

3. **Theme resolver** (`frontend/src/theme/resolve.ts`)
   - Map seed colors to the CSS variables currently in `index.css` (the shadcn/tailwind design token layer)
   - Or skip generation entirely and have each theme JSON supply literal HSL/hex values for each variable

4. **Theme loader** (`frontend/src/theme/loader.ts`)
   - Inject a `<style>` element overriding `:root` CSS variables
   - Set `data-theme` on `<html>` for identification

5. **Theme store** (`frontend/src/stores/themeStore.ts`)
   - Zustand store (matching our existing pattern) with `themeId`, `colorScheme` ("light"|"dark"|"system"), `setTheme()`, `setColorScheme()`
   - Persist selection via the existing Go `SettingsService.SetSetting("theme_id", id)` / `SetSetting("color_scheme", scheme)` -- no need for localStorage since we have SQLite
   - Listen to `prefers-color-scheme` media query for "system" mode

6. **Bundled themes** (`frontend/src/theme/themes/`)
   - Start with 3-4: default dark (current), a light variant, dracula, nord
   - Each is a JSON file mapping our CSS variable names to values

7. **Settings UI** (`SettingsPage.tsx`)
   - Add a "Theme" section below the existing sections
   - Theme picker grid showing name + small color preview swatches
   - Light/Dark/System toggle

8. **Wails window background color**
   - `main.go` sets `BackgroundColour` at startup -- this can't change at runtime, but we can set it to transparent/black and let CSS handle the rest (already the case with `R:9, G:9, B:11`)

**What we do NOT need from opencode:**
- Syntax highlighting tokens (we don't render code)
- Markdown tokens
- Diff tokens
- Avatar color tokens
- 200+ token resolution -- we have ~25 CSS variables
- SolidJS context -- we use React + zustand
- Theme preview/commit/cancel flow (nice-to-have later)
- Loading themes from URL (nice-to-have later)


## Done

### Dedicated Pull Request Detail Page
Clicking a PR row now opens an in-app detail page with all important PR information at a glance.

**What was done:**
- `frontend/src/pages/PRDetailPage.tsx` — NEW file. Two-column layout (main + sidebar):
  - **Header:** back button, title, PR number, repo, state badge, review decision badge, CI status icon, conflict indicator.
  - **Author card:** avatar, login, created/updated/merged timestamps with relative time.
  - **Branch info:** head ref -> base ref with code-styled labels.
  - **Description:** PR body rendered as GitHub-flavored Markdown using `react-markdown` + `remark-gfm`. Falls back to "No description" placeholder.
  - **Reviews:** list of all reviews with author avatar, name, state badge (Approved/Changes requested/Commented/Dismissed/Pending), relative timestamp, and body preview.
  - **Sidebar — Actions:** Open in GitHub button, Merge button (reuses existing `MergeButton` component), Request Review (reuses `ReviewerAssign`).
  - **Sidebar — Stats:** additions, deletions, changed files, commits count, size badge.
  - **Sidebar — Review Requests:** pending reviewers with user/team type badges.
  - **Sidebar — Labels:** rendered with GitHub hex colours (tinted background + border).
  - **Sidebar — Assignees:** avatar + name list.
  - **Sidebar — Timestamps:** created, updated, merged, closed with relative and absolute times.
  - PR data is looked up from the existing zustand store arrays (`useFindPR` hook searches myPRs, myRecentMerged, reviewRequests, teamReviewRequests, reviewedByMe). Not-found state shows a message with back button.
- `frontend/src/App.tsx` — Added route `/pr/:nodeId` pointing to `PRDetailPage`.
- `frontend/src/components/pr/PRTable.tsx` — Table rows are now clickable (`cursor-pointer`, `onClick` navigates to `/pr/:nodeId`). Actions column clicks are stopped from propagating so buttons still work independently. External link button retained.
- `frontend/package.json` — Added `react-markdown` and `remark-gfm` dependencies.

**Not done (future enhancements):**
- Backend `GetPRDetail(nodeId)` method to load from SQLite cache (currently uses in-memory store data which is sufficient for navigation from table rows).
- Refresh button to re-fetch a single PR from GitHub API (would need a new single-PR GraphQL query).

---

### Filter Out Teams
Allow users to select which teams' review requests are tracked. Teams are synced from GitHub and can be individually enabled/disabled in Settings.

**What was done:**
- `internal/storage/migrations.go` — Migration 3: `tracked_teams` table (`org_name`, `team_slug`, `team_name`, `enabled`, unique constraint on org+slug).
- `internal/storage/teams.go` — NEW file: `TrackedTeam` struct, `UpsertTrackedTeams`, `GetTrackedTeams`, `GetEnabledTeamSlugs`, `SetTeamEnabled`.
- `internal/services/settings.go` — Added `GetTrackedTeams(org)` and `SetTeamEnabled(org, slug, enabled)`.
- `internal/services/pullrequest.go` — Added `SyncTeamsForOrg(org)` which calls `client.GetViewerTeams()` and upserts into `tracked_teams`.
- `internal/services/poller.go` — Added `TeamReviewRequests` to `PollResult`; poll loop fetches team review requests for each enabled team per org.
- `frontend/src/stores/settingsStore.ts` — Added `teamsByOrg` state, `loadTeams(org)`, `loadAllTeams()`, `syncTeams(org)`, `setTeamEnabled(org, slug, enabled)`.
- `frontend/src/pages/SettingsPage.tsx` — Added "Teams" section: per-org list with enable/disable toggle switches and a Sync button to re-fetch teams from GitHub.
- `frontend/src/hooks/usePollerEvents.ts` — Added `teamReviewRequests` to `PollResult` interface and handler to push team review request data into `prStore`.
- Wails bindings auto-generated for `SettingsService.GetTrackedTeams`, `SettingsService.SetTeamEnabled`, `PullRequestService.SyncTeamsForOrg`, and `storage.TrackedTeam` model.

---

### Filter Out Bots
Toggle in Settings to exclude bot-authored PRs (Dependabot, Renovate, GitHub Actions, Snyk) from all views.

**What was done:**
- `internal/github/queries.go` -- fetch-all methods (`GetMyOpenPRs`, `GetMyRecentMergedPRs`, `GetReviewRequestsForUser`, `GetTeamReviewRequests`, `GetReviewedByUser`) now accept `filterBots bool` and use `buildQuery()` to append bot exclusions. Previously only the paginated variants did this.
- `internal/services/pullrequest.go` -- all fetch-all service methods now pass `s.filterBotsEnabled()` through to the client.
- `internal/services/poller.go` -- added `filterBotsEnabled()` method; `poll()` reads the setting once per cycle and passes it to every client call.
- `frontend/src/stores/settingsStore.ts` -- added `filterBots` state, `loadFilterBots()`, `setFilterBots()` using `GetSetting`/`SetSetting` Wails bindings.
- `frontend/src/pages/SettingsPage.tsx` -- added "Filters" section with a toggle switch for bot filtering.

**Future enhancement (not done):** configurable bot author list (currently hard-coded 4 bots).

---

### Lazy Pagination (Fetch on Demand)
Frontend now fetches one server page (25 items) at a time instead of exhausting all pages on load. Users can load more by navigating past loaded data.

**What was done:**
- `frontend/src/stores/prStore.ts` -- complete rewrite. Now imports paginated Wails bindings (`GetMyPRsPage`, `GetReviewRequestsPage`, etc.) instead of fetch-all variants. Tracks `ServerPageState` (endCursor, hasNextPage, totalCount) per category. First-page fetches reset and load page 1 with `SERVER_PAGE_SIZE = 25`. New `loadMore*` methods append next server page using stored cursor. `fetchAll` still used by Dashboard (fetches page 1 per category, not all pages).
- `frontend/src/components/pr/PRTable.tsx` -- added `serverPageInfo` and `onLoadMore` props. "Next" button triggers `onLoadMore` when user navigates past loaded data and the server has more pages. Shows "X loaded of Y" using server `totalCount`. Loading spinner inline when fetching. Removed "last page" jump button (incompatible with cursor pagination).
- `frontend/src/pages/MyPRsPage.tsx` -- wired `pageState.myPRs` as `serverPageInfo` and `loadMoreMyPRs` as `onLoadMore`.
- `frontend/src/pages/ReviewRequestsPage.tsx` -- same pattern with `pageState.reviewRequests` and `loadMoreReviewRequests`.
- `frontend/src/pages/ReviewedByMePage.tsx` -- same pattern with `pageState.reviewedByMe` and `loadMoreReviewedByMe`.
- `frontend/src/pages/DashboardPage.tsx` -- stat cards now use `pageState.*.totalCount` (server-reported total) instead of `array.length`, so counts are accurate even when only page 1 is loaded.
- `frontend/src/hooks/usePollerEvents.ts` -- poller update handler now resets `pageState` per category when it pushes data (poller fetches ALL pages, so cursors become stale; totalCount is set to array length).

---

### Cache-First with Configurable TTL
All data is served from cache unless the user explicitly clicks Refresh. Cache expires after a configurable window (default 5 minutes).

**What was done:**
- `frontend/src/stores/prStore.ts` -- changed `DEFAULT_CACHE_TTL_MS` from 15 minutes to 5 minutes.
- `frontend/src/stores/settingsStore.ts` -- added `cacheTTLMinutes` state (default 5), `loadCacheTTL()` reads `cache_ttl_minutes` from SQLite and syncs to `prStore.setCacheTTL()`, `setCacheTTL(minutes)` writes to SQLite (clamped 1-60) and immediately updates the prStore. Cross-store sync via `usePRStore.getState().setCacheTTL()`.
- `frontend/src/pages/SettingsPage.tsx` -- added "Cache" section with a numeric input (1-60 minutes) below the Filters section. Loads on mount via `loadCacheTTL()`.
- No Go backend changes needed -- uses existing `GetSetting`/`SetSetting` with the key `cache_ttl_minutes`. The setting is created on first save (SQLite upsert).
- Page components already use `fetchIfStale` on mount, only the Refresh button bypasses cache (force=true). Verified correct.
