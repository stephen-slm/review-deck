# Review Deck - TODO

## Active

### Decompose PRDetailPage Monolith
**Priority:** High

`PRDetailPage.tsx` is ~2600 lines handling all tabs, modals, action handlers, and state management in a single file. Extract into sub-components and hooks.

**Plan:**
- Extract each tab into its own component (`OverviewTab`, `ChecksTab`, `CommentsTab`, `FilesTab`, `CommitsTab`, `AIReviewTab`)
- Extract action handlers into a `usePRActions` hook
- Extract sidebar sections into separate components (`ReviewersSidebar`, `StatsSidebar`, etc.)
- Extract modal/dropdown components (`DetailMergeButton`, `DetailApproveButton`, `DetailRequestChangesButton`)

---

### ReviewedByMePage — Migrate to Repo-Scoped Fetching
**Priority:** High

ReviewedByMePage still uses org-scoped `fetchReviewedByMe` while MyPRsPage and ReviewRequestsPage have been migrated to repo-scoped endpoints.

**What's needed:**
- Backend `GetReviewedByMeForRepoPage` method (repo-scoped GraphQL query with pagination)
- Frontend migration to match the pattern used by MyPRsPage/ReviewRequestsPage

---

### Expose `review_max_age_days` Setting in UI
**Priority:** High

The backend filters out PRs older than `review_max_age_days` (used in `internal/services/pullrequest.go`) but this setting has no UI control. Users can't adjust it without editing the database directly.

**What's needed:**
- Add a "Max PR Age (days)" numeric input to GlobalSettingsPage under a data/cache section
- Wire to existing `GetSetting`/`SetSetting` with key `review_max_age_days`

---

### Consolidate Hardcoded `dark:` Classes to Theme Tokens
**Priority:** High

Components use hardcoded Tailwind dark-mode classes (`dark:text-green-300`, `dark:bg-red-950/20`, `dark:border-gray-700`, etc.) throughout the codebase instead of theme CSS variables. This bypasses the theme token system and would break if additional themes are added.

**What's needed:**
- Audit all `dark:` class usage across components
- Replace with CSS variable-based classes that adapt to the active theme
- Extend `index.css` or the ThemeProvider token set to include semantic color tokens for status colors (success, warning, danger, info), diff colors, etc.

---

## Backlog

### DashboardPage Uses Org-Based Fetching
**Priority:** Medium

DashboardPage still uses `fetchAll(orgs)` (org-scoped) while other pages migrated to repo-scoped endpoints. Also lacks a "no repo selected" guard.

---

### Excluded Repos Config Missing from Settings UI
**Priority:** Medium

Backend supports `excluded_repos` but the UI to configure it was lost during the SettingsPage restructuring.

---

### CommandPalette Lacks ARIA Dialog Role
**Priority:** Medium

The command palette overlay has no `role="dialog"`, `aria-modal="true"`, or `aria-label`. Screen readers won't announce it as a dialog. Same issue affects `ShortcutHintBar`.

---

### Icon-Only Buttons Lack `aria-label`
**Priority:** Medium

Refresh, close, filter toggle, and other icon-only buttons across all pages have no accessible labels.

---

### Swallowed Errors with `.catch(() => {})`
**Priority:** Medium

Several async calls in PRDetailPage (`GetCurrentBranch`, `CheckToolAvailability`, etc.) silently fail with no user feedback.

---

### FlaggedPRsPage Has No Refresh Button or Timestamp
**Priority:** Low

Every other list page shows a `LastRefreshed` timestamp and has a manual refresh button. FlaggedPRsPage has neither.

---

### No Dark Mode CSS Fallback
**Priority:** Low

`index.css` only defines light theme variables in `:root`. Dark theme is applied dynamically by JS, causing a brief flash-of-light-theme before hydration.

---

### Bot Author List Not User-Configurable
**Priority:** Low

Bot filtering uses a hardcoded list of 4 bots. Organizations with custom bot accounts can't filter them.

---

### No List Virtualization for Large PR Lists
**Priority:** Low

All PR rows render to the DOM. Could cause scroll performance issues with hundreds of PRs. Consider `react-window` or `@tanstack/react-virtual`.

---

### `source_base_path` Setting Has No UI
**Priority:** Low

The setting key exists in the settings store but isn't surfaced in any settings page. Either expose it or remove it.

---

### No Deep-Link / URL Scheme
**Priority:** Low

The app could register a `review-deck://` protocol for opening PRs directly from browser links or chat tools.

---

### Single PR Refresh / Backend Detail Fetch
**Priority:** Medium

Currently the PR detail page reads from the in-memory zustand store (populated by list fetches). If the user navigates directly to `/pr/:nodeId` or the data is stale, there's no way to fetch a single PR.

**What's needed:**
- Backend `GetPRDetail(nodeId)` method — single-PR GraphQL query, optionally cache in SQLite.
- Frontend refresh button on the detail page that re-fetches just that PR.

---

### Autocomplete for Excluded Repos
**Priority:** Low

The "Excluded Repositories" input in Settings currently requires the user to type the exact repo name. Adding autocomplete from repos seen in cached PR data would improve UX.

---

### Client-Side Fallback for Repo Exclusions
**Priority:** Low

If the exclusion list exceeds GitHub's query length limit (~256 chars), the query-time `-repo:` filtering silently truncates. A client-side fallback filter should catch any that leak through.

---

### Autocomplete for Priority Reviewers
**Priority:** Low

The "Priority Reviewers" input in Settings currently requires exact user/team names. Adding autocomplete from cached org members and viewer teams would improve UX.

---

### Drag-and-Drop Priority Reordering
**Priority:** Low

Priority reviewers currently use up/down arrow buttons for reordering. Drag-and-drop would be more intuitive.

---

### Priority Highlighting in My PRs View
**Priority:** Low

Extend the priority reviewer highlighting (yellow border + star) to the My PRs view — highlight PRs where a priority reviewer was requested but hasn't responded yet.

---

### Theme Support
**Priority:** Low
**Reference:** [opencode theme system](https://github.com/anomalyco/opencode/tree/dev/packages/ui/src/theme)

Add a theme engine inspired by opencode's approach. The app currently has a single hard-coded dark theme (zinc/neutral palette via Tailwind CSS variables). The goal is to support multiple themes with light/dark variants and a settings UI to switch between them.

---

## Done

### Clickable Notification Links
Toast notifications from the poller now navigate to the PR detail page when clicked.

**What was done:**
- `internal/services/poller.go` -- Added `NodeID` field to `Notification` struct. Populated in all 6 notification construction sites (new-review-request, pr-approved, changes-requested, ci-failed, ci-passed, pr-merged).
- `frontend/src/components/ui/Toast.tsx` -- Added optional `onClick` prop to `Toast` interface and `addToast` signature. Clickable toasts show cursor pointer, hover highlight, and "Click to view" hint. X button uses `stopPropagation`.
- `frontend/src/hooks/usePollerEvents.ts` -- Added `useNavigate`. Each notification toast gets `onClick` that navigates to `/pr/${nodeId}`.

---

### Collapsible Details/Summary in Markdown
Support GitHub-style `<details>`/`<summary>` collapsible sections in all markdown rendering.

**What was done:**
- `frontend/package.json` -- Added `rehype-raw` dependency.
- `frontend/src/pages/PRDetailPage.tsx` -- Imported `rehypeRaw`, added `rehypePlugins={[rehypeRaw]}` to all 3 ReactMarkdown instances. Added styled `details` and `summary` components to `mdComponents`.

---

### Pagination Page Cache
Previously fetched pages are cached in-memory so stepping back is instant without re-fetching from GitHub.

**What was done:**
- `frontend/src/stores/prStore.ts` -- Added `CachedPage` type and `pageCache` to `PaginationState`. `applyPageResult` stores each page with a timestamp. `getCachedPage` checks TTL (2 min). `applyCachedPage` applies a cache hit. All `goToPage*` methods check cache first. All `fetch*` and poller updates clear the cache.
- `frontend/src/hooks/usePollerEvents.ts` -- `pollerPage` helper includes `pageCache: {}`.

---

### PR Detail Page Approve and Merge Buttons
Dedicated, prominent Approve and Merge buttons in the PR detail page sidebar.

**What was done:**
- `internal/github/mutations.go` -- Added `ApprovePR(ctx, prNodeID, body)` using `addPullRequestReview` GraphQL mutation with `APPROVE` event.
- `internal/services/pullrequest.go` -- Added `ApprovePR(prNodeID, body)` service method.
- `frontend/src/stores/prStore.ts` -- Added `approvePR` action.
- `frontend/src/pages/PRDetailPage.tsx`:
  - `DetailApproveButton` -- Full-width outlined green button. Checks viewer login against PR author; disabled (grayed out, `opacity-40`) with tooltip when viewer is the author. Shows "Approved" badge if already approved or after approving.
  - `DetailMergeButton` -- Full-width solid green button with dropdown (merge/squash/rebase). Disabled with tooltip when PR is draft, has conflicts, or is not mergeable.
  - Replaced old icon-only `MergeButton` in sidebar with these dedicated buttons.

---

### PR Detail Page Tabs (Description / Checks / Comments)
Restructured the PR detail page main column into three tabs with lazy-loaded data.

**What was done:**
- `internal/github/queries.go` -- Added `checkRunsQuery` struct and `GetPRCheckRuns` method; `prCommentsQuery` struct and `GetPRComments` method (both use `node(id:)` GraphQL pattern).
- `internal/github/models.go` -- Added `DetailsURL` to `CheckRun`; added `ReviewComment`, `ReviewThread`, `IssueComment`, `PRComments` types.
- `internal/services/pullrequest.go` -- Added `GetPRCheckRuns(nodeID)` and `GetPRComments(nodeID)` service methods.
- `frontend/src/pages/PRDetailPage.tsx`:
  - Tab bar with Description, Checks, Comments tabs.
  - `useEffect` hooks lazy-load check runs and comments on first tab activation.
  - `ChecksTab` -- summary bar (pass/fail/pending counts), individual checks with status icons, conclusion text, external link.
  - `CommentsTab` -- issue comments as markdown cards, review threads with file path/line header, resolved/unresolved badges, nested replies.
  - `CommentCard` -- shared component with ReactMarkdown rendering.
  - Description tab contains the existing body + reviews sections.

---

### Clipboard Copy Utility
Per-row copy button and bulk copy dropdown with grouping options in PRTable.

**What was done:**
- `frontend/src/lib/clipboard.ts` -- NEW file. `formatSinglePR`, `formatPRs` (grouping: none, repo, size), `copyToClipboard`.
- `frontend/src/components/pr/PRTable.tsx` -- Per-row copy button (Copy/Check icon swap), "Copy" dropdown with three grouping options. Fixed stale closure bug by adding `copiedKey`, `handleCopyRow` to useMemo deps.

---

### Stacked PR Filter
Global setting and per-table toggle to hide stacked PRs (PRs whose base ref is not main/master/develop/development).

**What was done:**
- `frontend/src/stores/settingsStore.ts` -- Added `hideStackedPRs`, `loadHideStackedPRs`, `setHideStackedPRs`.
- `frontend/src/pages/SettingsPage.tsx` -- Added toggle in Filters section.
- `frontend/src/components/pr/PRTable.tsx` -- Per-table toggle button, `filteredData` filters against `DEFAULT_BRANCHES` set.
- `frontend/src/App.tsx` -- Loads `loadHideStackedPRs` on startup.

---

### My PRs Open/Merged Tabs
Rewrote My PRs page with tab switcher for open and recently merged PRs.

**What was done:**
- `frontend/src/pages/MyPRsPage.tsx` -- Full rewrite with Open/Merged tabs. Merged tab lazy-fetches via `fetchIfStale`. Each tab has independent pagination and page size.

---

### Markdown Rendering Improvements
Review bodies, PR descriptions, and comments rendered as GitHub-flavored markdown with system browser link handling.

**What was done:**
- `frontend/src/pages/PRDetailPage.tsx` -- Changed `<p>` to `<ReactMarkdown>` with `remarkGfm` + `mdComponents` for review body and PR description. Custom `mdComponents` with `BrowserOpenURL` onClick handler. Added `font-sans text-[14px]` typography.

---

### Reviewer States in Sidebar
Deduplicated reviewer display showing latest review state per author plus pending requests.

**What was done:**
- `frontend/src/pages/PRDetailPage.tsx` -- `ReviewersSidebar` component deduplicates reviews to latest per author, shows pending requests that haven't reviewed yet.

---

### Hide Pending Checks on Merged PRs
Pending CI status shown as neutral (no spinner) on merged PRs.

**What was done:**
- `frontend/src/components/pr/ChecksStatusIcon.tsx` -- Added `isMerged` prop. PENDING -> neutral for merged PRs. Updated in all call sites (PRTable, DashboardPage, PRDetailPage).

---

### Dashboard PR Click Navigation
PR rows on the dashboard navigate to the detail page.

**What was done:**
- `frontend/src/pages/DashboardPage.tsx` -- `PRRow` navigates to `/pr/${pr.nodeId}` on click. `e.stopPropagation()` on GitHub external link button.

---

### Complete Assignee Implementation with Cached Org Members
Replaced per-keystroke API calls in ReviewerAssign with client-side filtering over a locally cached member list.

**What was done:**
- `internal/storage/org_members.go` -- Added `GetOrgMembers(org)` method that returns ALL cached members.
- `internal/services/pullrequest.go` -- Added `GetOrgMembers(org)` service method exposed via Wails.
- `frontend/src/components/pr/ReviewerAssign.tsx` -- Rewrote to use client-side filtering.

---

### Filter Out Repositories
Allow users to exclude specific repositories from all PR views via query-time filtering.

**What was done:**
- `internal/storage/migrations.go` -- Migration 5: `excluded_repos` table.
- `internal/storage/excluded_repos.go` -- `GetExcludedRepos`, `AddExcludedRepo`, `RemoveExcludedRepo`.
- `internal/github/queries.go` -- Extended `buildQuery` to append `-repo:org/name` qualifiers.
- `frontend/src/pages/SettingsPage.tsx` -- "Excluded Repositories" section with add/remove UI.

---

### Priority Review List
Configurable priority list of users/teams whose review requests are surfaced first with visual distinction.

**What was done:**
- `internal/storage/priorities.go` -- `ReviewPriority` struct, CRUD operations.
- `frontend/src/pages/SettingsPage.tsx` -- Priority Reviewers section with reordering.
- `frontend/src/components/pr/PRTable.tsx` -- Yellow border + star icon for priority matches.

---

### Header Click to Fullscreen
Double-clicking the sidebar header toggles window between maximised and normal size.

---

### Dedicated Pull Request Detail Page
Clicking a PR row opens an in-app detail page with full PR information.

---

### Filter Out Teams
Allow users to select which teams' review requests are tracked.

---

### Filter Out Bots
Toggle to exclude bot-authored PRs from all views.

---

### Lazy Pagination (Fetch on Demand)
Frontend fetches one server page at a time instead of exhausting all pages on load.

---

### Cache-First with Configurable TTL
All data served from cache unless user clicks Refresh. Cache expires after configurable window (default 5 minutes).
