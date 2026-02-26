# Review Deck

A native macOS desktop app for tracking GitHub pull requests across your organizations. Built with [Wails v2](https://wails.io/) (Go backend + React/TypeScript frontend).

## Features

**Pull Request Views**

- **My PRs** — your open pull requests and recently merged PRs
- **Review Requests** — PRs awaiting your review (personal and team), with priority sorting
- **Reviewed By Me** — PRs you have already reviewed
- **PR Detail** — full view with description, file diffs (unified), CI checks, and comments

**Keyboard-First Navigation**

Vim-style keybindings throughout the app. Press `?` to see all available shortcuts for the current page.

| Key | Action |
|-----|--------|
| `j/k` | Navigate rows / scroll |
| `Enter` / `l` | Open selected PR |
| `o` | Open in GitHub |
| `Shift+J/K` | Smooth scroll page |
| `Cmd+1-5` | Switch sidebar tabs |
| `1-4` | Switch tabs (on PR detail) |
| `Space` | Toggle pick / expand file |
| `v` | Visual select mode |
| `c` | Copy selected PRs |
| `/` | Focus search |
| `r` | Refresh |
| `t` | Toggle draft PR visibility |
| `s` | Toggle stacked PR visibility |
| `x` | Hide review request |
| `a` | Assign reviewer |
| `m` | Merge PR |
| `A` | Approve PR |
| `?` | Show keyboard shortcuts |

**Filtering**

- Hide draft PRs (global setting or per-table toggle with `t`)
- Hide stacked/chained PRs targeting non-main branches (`s`)
- Hide individual review requests (`x`)
- Filter out bot PRs (Dependabot, Renovate, etc.)
- Exclude specific repositories per org
- Auto-fills table by fetching additional pages when filters reduce visible rows

**Background Polling & Notifications**

- Configurable poll interval (1–60 minutes)
- Desktop notifications for new review requests, approvals, CI status changes, and merged PRs
- Local SQLite cache for fast startup

**IDE Integration**

- Open files and repos directly in GoLand via JetBrains URL scheme
- Per-file buttons in the diff viewer

**Customization**

- Themes: System, Dark, Nord, Light
- Priority reviewers with visual indicators
- Team management with per-team enable/disable
- Configurable cache TTL and poll intervals

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
│   │   ├── queries.go         # GraphQL search queries
│   │   ├── mutations.go       # GraphQL mutations (merge, approve, etc.)
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
    │   ├── pages/             # Route pages (Dashboard, My PRs, etc.)
    │   ├── components/
    │   │   ├── layout/        # Sidebar, ShortcutHintBar
    │   │   ├── pr/            # PRTable, DiffView, MergeButton, badges
    │   │   └── ui/            # Toast, LastRefreshed
    │   ├── stores/            # Zustand stores (auth, PR, settings, vim)
    │   └── hooks/             # useVimNavigation, usePollerEvents
    └── wailsjs/               # Auto-generated Wails bindings
```

**Key technologies:** Wails v2, React 18, TypeScript, Zustand, TanStack Table, Tailwind CSS, tinykeys, GitHub GraphQL v4 + REST API, SQLite (pure Go).
