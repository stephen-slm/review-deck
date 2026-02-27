# Review Deck

A native macOS desktop app for tracking GitHub pull requests across your organizations. Built with [Wails v2](https://wails.io/) (Go backend + React/TypeScript frontend).

## Features

**Pull Request Views**

- **Dashboard** — overview of PR activity across all tracked organizations
- **My PRs** — your open pull requests and recently merged PRs, with tab switching (`1`/`2`)
- **Review Requests** — PRs awaiting your review (personal and team), with priority sorting and flagged PR highlighting
- **Reviewed By Me** — PRs you have already reviewed, with "hide approved by me" filter (`f`)
- **Flagged PRs** — aggregated view of PRs matching your configurable flag rules
- **PR Detail** — full view with description (unlimited length), file diffs (unified), CI checks, comments, reviewers sidebar, and flag reason display

**Keyboard-First Navigation**

Vim-style keybindings throughout the app. Press `?` to see all available shortcuts for the current page.

| Key | Action |
|-----|--------|
| `j/k` | Navigate rows / scroll |
| `Enter` / `l` | Open selected PR |
| `o` | Open in GitHub |
| `Shift+J/K` | Smooth scroll page |
| `Cmd+1-6` | Switch sidebar tabs |
| `1-4` | Switch in-page tabs (My PRs, PR detail) |
| `Space` | Toggle pick / expand file |
| `v` | Visual select mode |
| `c` | Copy selected PRs |
| `/` | Focus search |
| `Shift+R` | Refresh |
| `t` | Toggle draft PR visibility |
| `s` | Toggle stacked PR visibility |
| `f` | Toggle "approved by me" filter |
| `x` | Hide review request |
| `A` | Approve PR |
| `m` | Squash and merge PR |
| `r/u` | Resolve / unresolve review thread |
| `?` | Show keyboard shortcuts |

**Flagged PR Rules**

Configure rules in Settings to flag PRs that need extra attention:

- **Keyword rules** — case-insensitive match against PR title, body, branch name, and labels (e.g. `breaking`, `migration`, `security`)
- **Size rules** — flag PRs by total lines changed (additions + deletions) with operators `>`, `<`, `=`
- Flagged PRs are highlighted with a red border in Review Requests and Reviewed By Me tables
- Dedicated Flagged tab aggregates all matching PRs with a "Reason" column
- Flag reasons are also shown in the PR detail page sidebar
- Rules are persisted and can be individually enabled/disabled

**Filtering**

- Hide draft PRs (global setting or per-table toggle with `t`)
- Hide stacked/chained PRs targeting non-main branches (`s`)
- Hide PRs you've already approved on Reviewed By Me (`f`)
- Hide individual review requests (`x`)
- Filter out bot PRs (Dependabot, Renovate, GitHub Actions, Snyk)
- Filter out Copilot review comments and review threads
- Exclude specific repositories per org
- Review max age setting — limit review queries to PRs updated within N days (default 7, range 1-90)
- Auto-fills table by fetching additional pages when filters reduce visible rows

**Background Polling & Notifications**

- Configurable poll interval (1-60 minutes)
- Desktop notifications for new review requests, approvals, CI status changes, and merged PRs
- Local SQLite cache for fast startup

**IDE Integration**

- Open files and repos directly in GoLand via JetBrains URL scheme
- Per-file buttons in the diff viewer

**Customization**

- Themes: System, Dark, Nord, Light
- Priority reviewers with visual indicators and autocomplete
- Team management with per-team enable/disable
- Configurable cache TTL, poll intervals, and PR detail refresh interval
- Tabbed settings page: General, Filters, Teams & Priority, Flag Rules, Advanced

**Table Features**

- Server-side pagination with configurable page size (10, 15, 20, 25 — default 25)
- Sortable columns with search filtering
- Size badges (XS/S/M/L/XL) and additions/deletions diff column (+N / -N)
- Visual/multi-select mode for bulk copy operations
- Copy PRs to clipboard (no grouping, by repo, or by size)

## Requirements

- macOS (Wails v2 desktop app)
- Go 1.25+
- Node.js 18+
- A GitHub Personal Access Token with scopes: `repo`, `read:org`, `read:user`

## Development

```bash
# Install Wails CLI
go install github.com/wailsapp/wails/v2/cmd/wails@latest

# Install frontend dependencies
cd frontend && npm install && cd ..

# Run in development mode
wails dev

# Build for production
wails build
```

## Architecture

```
review-deck/
├── main.go                    # Wails entrypoint, binds services
├── app.go                     # App lifecycle, image proxy, poller control
├── internal/
│   ├── github/
│   │   ├── client.go          # GraphQL + REST client
│   │   ├── models.go          # Data types (PR, CheckRun, Review, etc.)
│   │   ├── queries.go         # GraphQL search queries (with review max age)
│   │   ├── mutations.go       # GraphQL mutations (squash merge, approve, etc.)
│   │   ├── auth.go            # Viewer info, org members, teams
│   │   ├── files.go           # REST API for file diffs
│   │   └── ratelimit.go       # Rate limit queries
│   ├── services/
│   │   ├── auth.go            # PAT authentication
│   │   ├── pullrequest.go     # PR fetching, actions, pagination
│   │   ├── settings.go        # Settings CRUD (wraps storage)
│   │   └── poller.go          # Background polling + notifications
│   ├── storage/               # SQLite persistence layer
│   └── config/                # App data directory helpers
└── frontend/
    ├── src/
    │   ├── pages/             # Route pages (Dashboard, My PRs, Flagged, etc.)
    │   ├── components/
    │   │   ├── layout/        # Sidebar, ShortcutHintBar
    │   │   ├── pr/            # PRTable, DiffView, badges
    │   │   └── ui/            # Toast, LastRefreshed
    │   ├── stores/            # Zustand stores (auth, PR, settings, vim, flag)
    │   └── hooks/             # useVimNavigation, usePollerEvents
    └── wailsjs/               # Auto-generated Wails bindings
```

**Key technologies:** Wails v2, React 18, TypeScript, Zustand, TanStack Table, Tailwind CSS, tinykeys, GitHub GraphQL v4 + REST API, SQLite (pure Go).
