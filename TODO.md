# Review Deck - TODO

## Active


## Backlog

---

---

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

### Complete Assignee Implementation with Cached Org Members
Replaced per-keystroke API calls in ReviewerAssign with client-side filtering over a locally cached member list.

**What was done:**
- `internal/storage/org_members.go` — Added `GetOrgMembers(org)` method that returns ALL cached members (the table, `UpsertOrgMembers`, `SearchOrgMembers`, `GetOrgMembersSyncedAt`, and `GetOrgMemberCount` already existed from prior work).
- `internal/services/pullrequest.go` — Added `GetOrgMembers(org)` service method exposed via Wails.
- `frontend/wailsjs/go/services/PullRequestService.d.ts` — Added `GetOrgMembers` binding (`.js` auto-generated).
- `frontend/src/components/pr/ReviewerAssign.tsx` — Rewrote to use client-side filtering:
  - On dropdown open: loads full member list from `GetOrgMembers(org)` (single Wails call to SQLite, no API hit).
  - Filters locally with `useMemo` as user types — zero API/Wails calls per keystroke.
  - If cache is empty on first open, triggers `SyncOrgMembers` and reloads.
  - Removed debounce timer and `SearchOrgMembers` dependency entirely.

**Already existed (no changes needed):**
- `org_members` SQLite table (migration 2), `SyncOrgMembers`, `SyncOrgMembersIfStale` service methods, poller member sync (`syncOrgMembersIfNeeded`), and `SyncOrgMembers` Wails binding via `App`.

---

### Filter Out Repositories
Allow users to exclude specific repositories from all PR views via query-time filtering.

**What was done:**
- `internal/storage/migrations.go` — Migration 5: `excluded_repos` table (`org_name`, `repo_name`, unique constraint).
- `internal/storage/excluded_repos.go` — NEW file: `GetExcludedRepos(org)`, `AddExcludedRepo(org, repo)`, `RemoveExcludedRepo(org, repo)`.
- `internal/services/settings.go` — Added `GetExcludedRepos`, `AddExcludedRepo`, `RemoveExcludedRepo`.
- `internal/github/queries.go` — Extended `buildQuery` to accept `excludedRepos []string` and append `-repo:org/name` qualifiers (Option A: query-time filtering). Updated all 10 client methods (5 fetch-all + 5 paginated) to accept and pass `excludedRepos`.
- `internal/services/pullrequest.go` — Added `getExcludedRepos(org)` helper that reads from DB and formats as `org/repo`. All 10 service methods now pass excluded repos to the client.
- `internal/services/poller.go` — Added `getExcludedRepos(org)` helper. All poller fetch calls now pass excluded repos per org.
- Wails bindings auto-generated for `GetExcludedRepos`, `AddExcludedRepo`, `RemoveExcludedRepo`.
- `frontend/src/stores/settingsStore.ts` — Added `excludedReposByOrg` state, `loadExcludedRepos(org)`, `loadAllExcludedRepos()`, `addExcludedRepo(org, repo)`, `removeExcludedRepo(org, repo)`.
- `frontend/src/pages/SettingsPage.tsx` — Added "Excluded Repositories" section: per-org list with text input + Exclude button. Each excluded repo shown as `org/repo` with a remove button.

**Not done (future enhancements):**
- Autocomplete from repos seen in cached PR data.
- Fallback to client-side filtering if exclusion list exceeds GitHub query length limit (~256 chars).

---

### Priority Review List
Configurable priority list of users/teams whose review requests are surfaced first with visual distinction.

**What was done:**
- `internal/storage/migrations.go` — Migration 4: `review_priorities` table (`org_name`, `name`, `type` with CHECK constraint, `priority`, `created_at`, unique on org+name+type).
- `internal/storage/priorities.go` — NEW file: `ReviewPriority` struct, `GetReviewPriorities(org)` (ordered by priority DESC), `AddReviewPriority` (auto-assigns max+1), `RemoveReviewPriority`, `UpdateReviewPriorityOrder`.
- `internal/services/settings.go` — Added `GetReviewPriorities`, `AddReviewPriority`, `RemoveReviewPriority`, `UpdateReviewPriorityOrder`.
- Wails bindings auto-generated for all 4 methods and `storage.ReviewPriority` model.
- `frontend/src/stores/settingsStore.ts` — Added `prioritiesByOrg` state, `loadPriorities(org)`, `loadAllPriorities()`, `addPriority(org, name, type)`, `removePriority(org, name, type)`, `movePriority(org, name, type, direction)` (swaps priority values with adjacent item), `getPriorityNames()` (returns Set of all priority names for quick lookup).
- `frontend/src/pages/SettingsPage.tsx` — Added "Priority Reviewers" section: per-org card with text input + user/team type selector + Add button. Priority list with up/down arrows for reordering and remove button per entry.
- `frontend/src/components/pr/PRTable.tsx` — Added optional `priorityNames` prop (Set<string>). Matching rows (author or review requester in set) get a yellow left border, subtle yellow background tint, and a filled star icon on the first cell.
- `frontend/src/pages/ReviewRequestsPage.tsx` — Loads priorities on mount. Sorts review requests so priority-matched PRs appear first (stable sort). Passes `priorityNames` to PRTable.

**Not done (future enhancements):**
- Autocomplete from cached org members and viewer teams in the add input.
- Drag-and-drop reordering (currently uses up/down arrows).
- Extending to My PRs view (highlight PRs where a priority reviewer was requested but hasn't responded).

---

### Header Click to Fullscreen
Double-clicking the sidebar header toggles the window between maximised and normal size.

**What was done:**
- `frontend/src/components/layout/Sidebar.tsx` — Added `onDoubleClick` handler on the "Review Deck" heading container that calls `WindowToggleMaximise()` from the Wails runtime. Uses double-click to match macOS titlebar convention.

---

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
