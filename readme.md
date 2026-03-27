# Review Deck

> **Note:** This project is a port of a personal CLI tool, into a full desktop UI. The entire codebase — Go backend, React frontend, and everything in between — was **100% AI-generated** using [Claude Code](https://claude.ai/claude-code). PRs, issues, and contributions are welcome!

A native macOS desktop app for managing GitHub pull requests across your repositories. Built with [Wails v2](https://wails.io/) (Go backend + React/TypeScript frontend).

## Features

### Pull Request Views

- **Dashboard** — overview with stat cards and PR lists across all categories
- **My PRs** — your open pull requests and recently merged PRs, with tab switching (`1`/`2`)
- **Review Requests** — PRs awaiting your review (personal and team), with priority sorting and flagged PR highlighting
- **Reviewed By Me** — PRs you have already reviewed, with "hide approved by me" filter (`f`)
- **Flagged PRs** — aggregated view of PRs matching your configurable flag rules
- **PR Detail** — full view with description, unified file diffs, CI checks, comments/review threads, commits, AI review, and a reviewers sidebar

### All Repos Mode

View PRs across all tracked repositories at once, instead of one repo at a time:

- Select "All Repos" from the sidebar repo dropdown or Command Palette (`Cmd+0`)
- All PR list pages fetch across every tracked repo simultaneously
- Persisted between sessions — your last selection is restored on startup

### Command Palette

Press `Cmd+K` to open the Command Palette. It provides fuzzy-searchable access to:

- **Navigation** — jump to any page (`Cmd+1`-`5`), go back
- **Repository switching** — enter repo picker sub-mode (`Cmd+0`), select All Repos or a specific repo, add new repos
- **Actions** — refresh, focus search, copy PR, show shortcuts, force refresh all data, sign out
- **Filters** — toggle drafts (`t`), stacked PRs (`s`), approved-by-me (`f`), hide/unhide PRs (`x`)
- **PR actions** (on detail page) — open in GitHub, approve, request changes, merge, assign reviewer/label, mark ready for review
- **Workspace** (on detail page with local repo) — checkout branch, open terminal
- **AI** (on detail page) — generate title (`H`), description (`D`), review (`E`)
- **Theme** — switch between Light, Dark, and System themes
- **PR search** — type to search across all loaded PRs by number, title, author, branch, repo, and labels

### Keyboard-First Navigation

Vim-style keybindings throughout the app. Press `?` to see all available shortcuts for the current page.

**Global**

| Key | Action |
|-----|--------|
| `Cmd+K` | Command Palette |
| `Cmd+0` | Switch repository |
| `Cmd+1`-`5` | Switch sidebar tabs |
| `?` | Show keyboard shortcuts |
| `Shift+J`/`K` | Smooth scroll page |
| `Backspace` | Go back |

**List Navigation**

| Key | Action |
|-----|--------|
| `j`/`k` | Navigate rows |
| `Enter`/`l` | Open selected PR |
| `o` | Open in GitHub |
| `gg`/`G` | Jump to top / bottom |
| `n`/`N` | Next / previous page |
| `/` | Focus search |
| `R` | Refresh |
| `v` | Visual select mode |
| `Space` | Toggle pick |
| `c` | Copy selected PRs |

**Filters**

| Key | Action |
|-----|--------|
| `t` | Toggle draft PR visibility |
| `s` | Toggle stacked PR visibility |
| `f` | Toggle "approved by me" filter |
| `x` | Hide review request |

**PR Detail**

| Key | Action |
|-----|--------|
| `1`-`6` | Switch tabs (Description, Checks, Comments, Files, Commits, AI Review) |
| `h`/`l` | Previous / next tab |
| `A` | Approve PR |
| `d` | Request changes |
| `m` | Squash and merge PR |
| `a` | Assign reviewer |
| `b` | Assign label |
| `r`/`u` | Resolve / unresolve review thread |
| `Space` | Expand/collapse file |
| `D` | Generate AI description |
| `H` | Generate AI title |
| `E` | Generate AI review |

### AI Integration

Powered by the [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) and [GitHub CLI](https://cli.github.com/):

- **AI Code Review** (`E`) — generates a detailed code review of the PR diff using Claude
- **AI Description** (`D`) — generates a PR description from the diff and commits, with one-click apply to GitHub
- **AI Title** (`H`) — generates a concise PR title, with one-click apply to GitHub. Auto-prepends ticket prefix from branch name (e.g. `JIRA-123`)
- Generated title/description action buttons (Regenerate, Discard, Apply) are navigable via `j`/`k` and `Enter`
- Configurable prompts and cost limits in Global Settings
- Review results are cached locally with a 7-day TTL

### Flagged PR Rules

Configure rules in Settings to flag PRs that need extra attention:

- **Keyword rules** — case-insensitive match against PR title, body, branch name, and labels (e.g. `breaking`, `migration`, `security`)
- **Size rules** — flag PRs by total lines changed (additions + deletions) with operators `>`, `<`, `=`
- Flagged PRs are highlighted with a red border in Review Requests and Reviewed By Me tables
- Dedicated Flagged tab aggregates all matching PRs with a "Reason" column
- Flag reasons are also shown in the PR detail page sidebar
- Rules are persisted per-repo and can be individually enabled/disabled

### Filtering

- Hide draft PRs (global setting or per-table toggle with `t`)
- Hide stacked/chained PRs targeting non-main branches (`s`)
- Hide PRs you've already approved on Reviewed By Me (`f`)
- Hide individual review requests (`x`)
- Filter out bot PRs (Dependabot, Renovate, GitHub Actions, Snyk)
- Filter out specific users' comments and reviews (configurable per-repo)
- Exclude specific repositories per org
- Review max age setting — limit review queries to PRs updated within N days (default 7, range 1-90)
- Auto-fills table by fetching additional pages when filters reduce visible rows

### Background Polling & Notifications

- Configurable poll interval (1-60 minutes)
- Desktop notifications for new review requests, approvals, CI status changes, and merged PRs
- Local SQLite cache with automatic pruning of stale records (30-day TTL)

### Settings

**Per-Repository** (Settings page, 3 tabs):

- **Filters** — bot filtering, draft/stacked visibility, filtered comment users, filtered review users, label sync
- **Teams & Priority** — enable/disable teams for review request views, priority reviewers for triage ordering
- **Flag Rules** — keyword and size-based flag rules

**Global** (Global Settings page, 3 tabs):

- **General** — GitHub authentication, theme picker, tracked repositories management
- **AI** — custom prompts and cost limits for AI review, description, and title generation
- **Advanced** — cache expiry (1-60 min), poll interval (1-60 min), PR detail refresh interval (10-300 sec)

### Table Features

- Server-side pagination with configurable page size (10, 15, 20, 25 — default 25)
- Sortable columns with search filtering
- Size badges (XS/S/M/L/XL) and additions/deletions diff column (+N / -N)
- Visual/multi-select mode for bulk copy operations
- Copy PRs to clipboard (no grouping, by repo, or by size)

### Themes

- System (follows OS preference), Dark, Light

## Requirements

- macOS (Wails v2 desktop app)
- Go 1.25+
- Node.js 18+
- A GitHub Personal Access Token with scopes: `repo`, `read:org`, `read:user`

For AI features:
- [GitHub CLI](https://cli.github.com/) (`gh`) — installed and available on PATH
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) (`claude`) — installed and available on PATH

## Development

```bash
# Install Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Install frontend dependencies
cd frontend && npm install && cd ..

# Run in development mode
wails dev

# Regenerate TypeScript bindings after Go changes
wails generate module

# Build for production (.app bundle)
wails build
```

## Architecture

```
review-deck/
├── main.go                          # Wails entrypoint, PATH fix, service binding
├── app.go                           # App lifecycle, image proxy, poller control
├── wails.json                       # Wails build/dev configuration
├── internal/
│   ├── github/
│   │   ├── client.go                # GraphQL + REST client
│   │   ├── models.go                # Data types (PR, CheckRun, Review, etc.)
│   │   ├── queries.go               # GraphQL search queries (paginated, all, multi-repo)
│   │   ├── mutations.go             # GraphQL mutations (merge, approve, labels)
│   │   ├── auth.go                  # Viewer info, org members, teams
│   │   ├── files.go                 # REST API for file diffs
│   │   └── ratelimit.go             # Rate limit queries
│   ├── services/
│   │   ├── auth.go                  # PAT authentication + token storage
│   │   ├── pullrequest.go           # PR fetching, actions, pagination (repo/org/all-repos)
│   │   ├── poller.go                # Background polling + desktop notifications
│   │   ├── repo.go                  # Tracked repository management
│   │   ├── workspace.go             # AI review/description/title, PR checkout, terminal
│   │   ├── settings.go              # Settings CRUD
│   │   └── settings_helpers.go      # Shared helpers (bot filter, review age, excluded repos)
│   ├── storage/
│   │   ├── db.go                    # SQLite init + connection
│   │   ├── migrations.go            # Schema migrations (12 migrations)
│   │   ├── settings.go              # Settings CRUD
│   │   ├── repos.go                 # Tracked repos CRUD
│   │   ├── pullrequests.go          # PR storage + pruning
│   │   ├── reviews.go               # Review storage
│   │   ├── labels.go                # Label storage
│   │   ├── teams.go                 # Team storage
│   │   ├── priorities.go            # Priority reviewer storage
│   │   ├── org_members.go           # Org members cache
│   │   ├── excluded_repos.go        # Excluded repos storage
│   │   ├── metrics.go               # Metrics snapshots
│   │   └── ai_reviews.go            # AI review cache (7-day TTL)
│   ├── gitutil/
│   │   ├── remote.go                # Git remote URL parsing
│   │   ├── checkout.go              # Branch checkout
│   │   └── terminal.go              # Terminal launcher
│   └── config/
│       └── config.go                # App data directory helpers
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Routes, startup hydration, onboarding guard
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx    # Overview dashboard with stat cards
│   │   │   ├── OnboardingPage.tsx   # PAT login + repo setup
│   │   │   ├── MyPRsPage.tsx        # Open / recently merged tabs
│   │   │   ├── ReviewRequestsPage.tsx
│   │   │   ├── ReviewedByMePage.tsx
│   │   │   ├── FlaggedPRsPage.tsx
│   │   │   ├── PRDetailPage.tsx     # Full PR detail with 6 tabs
│   │   │   ├── SettingsPage.tsx     # Per-repo settings (3 tabs)
│   │   │   └── GlobalSettingsPage.tsx  # App-wide settings (3 tabs)
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx      # Navigation sidebar with repo dropdown
│   │   │   │   ├── CommandPalette.tsx  # Cmd+K command palette
│   │   │   │   └── ShortcutHintBar.tsx  # Keyboard shortcut overlay
│   │   │   ├── pr/
│   │   │   │   ├── PRTable.tsx      # Reusable PR list table
│   │   │   │   ├── DiffView.tsx     # Unified file diff viewer
│   │   │   │   ├── StateBadge.tsx   # PR state badge
│   │   │   │   ├── ReviewStatusBadge.tsx
│   │   │   │   ├── ReviewStateBadge.tsx
│   │   │   │   ├── ChecksStatusIcon.tsx
│   │   │   │   ├── PRSizeBadge.tsx
│   │   │   │   ├── LabelBadge.tsx
│   │   │   │   ├── MergeButton.tsx
│   │   │   │   ├── ReviewerAssign.tsx
│   │   │   │   ├── LabelAssign.tsx
│   │   │   │   └── detail/         # PR detail sub-components
│   │   │   │       ├── ChecksTab.tsx
│   │   │   │       ├── CommentsTab.tsx
│   │   │   │       ├── AIReviewPanel.tsx
│   │   │   │       ├── ReviewersSidebar.tsx
│   │   │   │       ├── SidebarSection.tsx
│   │   │   │       ├── DetailMergeButton.tsx
│   │   │   │       ├── DetailApproveButton.tsx
│   │   │   │       ├── DetailRequestChangesButton.tsx
│   │   │   │       └── DetailReadyForReviewButton.tsx
│   │   │   ├── ui/
│   │   │   │   ├── Toast.tsx
│   │   │   │   └── LastRefreshed.tsx
│   │   │   └── ErrorBoundary.tsx
│   │   ├── stores/
│   │   │   ├── authStore.ts         # Authentication state
│   │   │   ├── prStore.ts           # PR data + pagination + actions
│   │   │   ├── repoStore.ts         # Tracked repos, All Repos mode
│   │   │   ├── settingsStore.ts     # Filters, teams, priorities, AI prompts, theme
│   │   │   ├── flagStore.ts         # Flag rules (keyword, size)
│   │   │   └── vimStore.ts          # Vim navigation state + command palette
│   │   ├── hooks/
│   │   │   ├── useVimNavigation.ts  # Global tinykeys keyboard bindings
│   │   │   ├── usePollerEvents.ts   # Wails event listener for poller updates
│   │   │   ├── useFindPR.ts         # Find PR by nodeId across store categories
│   │   │   └── useWindowFocus.ts    # Window focus/blur detection
│   │   ├── theme/
│   │   │   ├── tokens.ts            # ThemeTokens interface + ThemeDefinition type
│   │   │   ├── light.ts             # Light theme values
│   │   │   ├── dark.ts              # Dark theme values
│   │   │   ├── index.ts             # Theme registry + CSS variable application
│   │   │   └── ThemeProvider.tsx     # React context + system preference detection
│   │   └── lib/
│   │       ├── utils.ts             # cn(), timeAgo(), hexLuminance()
│   │       ├── clipboard.ts         # PR copy formatting
│   │       └── markdownComponents.tsx  # Custom ReactMarkdown renderers
│   └── wailsjs/                     # Auto-generated Wails TypeScript bindings
└── build/
    └── darwin/                      # macOS app bundle config (Info.plist)
```

### Key Technologies

| Layer | Technology |
|-------|-----------|
| Desktop framework | [Wails v2](https://wails.io/) |
| Backend | Go 1.25, SQLite ([modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite) — pure Go, no CGO) |
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS, class-variance-authority |
| State management | [Zustand](https://github.com/pmndrs/zustand) |
| Tables | [TanStack Table](https://tanstack.com/table) |
| Keyboard shortcuts | [tinykeys](https://github.com/jamiebuilds/tinykeys) |
| Icons | [Lucide](https://lucide.dev/) |
| Markdown | react-markdown, remark-gfm, rehype-raw |
| GitHub API | GraphQL v4 ([shurcooL/githubv4](https://github.com/shurcooL/githubv4)) + REST ([go-github](https://github.com/google/go-github)) |
| AI | [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli), [GitHub CLI](https://cli.github.com/) |
