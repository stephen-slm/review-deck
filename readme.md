# Review Deck

A native macOS desktop app for managing GitHub pull requests across your repositories. Built with [Wails v2](https://wails.io/) (Go backend + React/TypeScript frontend).

## Features

### Pull Request Views

- **My PRs** — your open pull requests and recently merged PRs, with tab switching (`1`/`2`)
- **Review Requests** — PRs awaiting your review (personal and team), with priority sorting and flagged PR highlighting
- **Reviewed By Me** — PRs you have already reviewed, with "hide approved by me" filter (`f`)
- **Flagged PRs** — aggregated view of PRs matching your configurable flag rules
- **PR Detail** — full view with description, unified file diffs, CI checks, comments/review threads, commits, AI review, and a reviewers sidebar

### Keyboard-First Navigation

Vim-style keybindings throughout the app. Press `?` to see all available shortcuts for the current page.

| Key | Action |
|-----|--------|
| `j`/`k` | Navigate rows / scroll |
| `Enter` / `l` | Open selected PR |
| `o` | Open in GitHub |
| `Shift+J`/`K` | Smooth scroll page |
| `Cmd+1-5` | Switch sidebar tabs |
| `1-6` | Switch in-page tabs (PR detail) |
| `Space` | Toggle pick / expand file |
| `v` | Visual select mode |
| `c` | Copy selected PRs |
| `/` | Focus search |
| `R` | Refresh |
| `gg` / `G` | Jump to top / bottom of list |
| `D` | Generate AI description |
| `H` | Generate AI title |
| `E` | Generate AI review |
| `A` | Approve PR |
| `m` | Squash and merge PR |
| `d` | Request changes |
| `a` | Assign reviewer |
| `r`/`u` | Resolve / unresolve review thread |
| `t` | Toggle draft PR visibility |
| `s` | Toggle stacked PR visibility |
| `f` | Toggle "approved by me" filter |
| `x` | Hide review request |
| `n`/`N` | Next / previous page |
| `?` | Show keyboard shortcuts |

### AI Integration

Powered by the [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) and [GitHub CLI](https://cli.github.com/):

- **AI Code Review** (`E`) — generates a detailed code review of the PR diff using Claude
- **AI Description** (`G`) — generates a PR description from the diff and commits, with one-click apply to GitHub
- **AI Title** (`H`) — generates a concise PR title, with one-click apply to GitHub
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
- Filter out Copilot review comments and review threads
- Exclude specific repositories per org
- Review max age setting — limit review queries to PRs updated within N days (default 7, range 1-90)
- Auto-fills table by fetching additional pages when filters reduce visible rows

### Background Polling & Notifications

- Configurable poll interval (1-60 minutes)
- Desktop notifications for new review requests, approvals, CI status changes, and merged PRs
- Local SQLite cache for fast startup

### Per-Repository Settings

- All settings (filters, flag rules, teams, priorities) are scoped per repository
- Switching repos applies independent configuration
- Global defaults are materialized into per-repo keys on first access

### Table Features

- Server-side pagination with configurable page size (10, 15, 20, 25 — default 25)
- Sortable columns with search filtering
- Size badges (XS/S/M/L/XL) and additions/deletions diff column (+N / -N)
- Visual/multi-select mode for bulk copy operations
- Copy PRs to clipboard (no grouping, by repo, or by size)

### Themes

- System, Dark, Nord, Light

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
│   │   ├── queries.go               # GraphQL search queries
│   │   ├── mutations.go             # GraphQL mutations (merge, approve)
│   │   ├── auth.go                  # Viewer info, org members, teams
│   │   ├── files.go                 # REST API for file diffs
│   │   └── ratelimit.go             # Rate limit queries
│   ├── services/
│   │   ├── auth.go                  # PAT authentication + token storage
│   │   ├── pullrequest.go           # PR fetching, actions, pagination
│   │   ├── settings.go              # Settings CRUD
│   │   ├── repo.go                  # Tracked repository management
│   │   ├── workspace.go             # AI review/description/title, PR checkout, terminal
│   │   └── poller.go                # Background polling + desktop notifications
│   ├── storage/                     # SQLite persistence (11 migrations)
│   ├── gitutil/                     # Git helpers (remotes, checkout, branch, terminal)
│   └── config/                      # App data directory helpers
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Routes, startup hydration
│   │   ├── pages/                   # Route pages
│   │   │   ├── OnboardingPage.tsx   # PAT login + repo setup
│   │   │   ├── MyPRsPage.tsx        # Open / recently merged tabs
│   │   │   ├── ReviewRequestsPage.tsx
│   │   │   ├── ReviewedByMePage.tsx
│   │   │   ├── FlaggedPRsPage.tsx
│   │   │   ├── PRDetailPage.tsx     # Full PR detail with 6 tabs
│   │   │   ├── SettingsPage.tsx     # Per-repo settings
│   │   │   └── GlobalSettingsPage.tsx
│   │   ├── components/
│   │   │   ├── layout/              # Sidebar, ShortcutHintBar
│   │   │   ├── pr/                  # PRTable, DiffView, badges, ReviewerAssign
│   │   │   └── ui/                  # Toast, LastRefreshed
│   │   ├── stores/                  # Zustand stores
│   │   │   ├── authStore.ts         # Authentication state
│   │   │   ├── prStore.ts           # PR data + pagination
│   │   │   ├── settingsStore.ts     # Filters, teams, priorities, excluded repos
│   │   │   ├── repoStore.ts         # Tracked repos + selection
│   │   │   ├── flagStore.ts         # Flag rules (keyword, size)
│   │   │   └── vimStore.ts          # Vim navigation state
│   │   ├── hooks/                   # useVimNavigation, usePollerEvents, useWindowFocus
│   │   ├── theme/                   # Theme provider + token definitions
│   │   └── lib/                     # Clipboard formatting, utilities
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
