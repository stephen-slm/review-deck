# Trending Metrics Page

## Overview

A dedicated `/metrics` page showing historical trends and current-state breakdowns for PR activity. Metrics are backed by their own SQLite table (`metrics_snapshots`) that accumulates data points over time, recorded after each poller cycle.

## Architecture

```
Poller completes cycle
        |
        v
 computeSnapshot(PollResult) -> MetricsSnapshot
        |
        v
 db.InsertMetricsSnapshot(snapshot)
        |
        v
 emit("poller:update", result)   (existing)
```

**Two data sources on the frontend:**

| Source                                          | Use                          | Examples                                             |
| ----------------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| Historical snapshots (from backend DB)          | Trend lines over days/weeks  | Open PR count over time, avg merge time trend        |
| Current store state (from Zustand page cache)   | Point-in-time breakdowns     | PR size distribution, repo breakdown, attention list |

## Backend Changes

### 1. New SQLite Migration (migration 6)

```sql
CREATE TABLE IF NOT EXISTS metrics_snapshots (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    open_prs            INTEGER NOT NULL DEFAULT 0,
    pending_reviews     INTEGER NOT NULL DEFAULT 0,
    team_reviews        INTEGER NOT NULL DEFAULT 0,
    reviewed_by_me      INTEGER NOT NULL DEFAULT 0,
    merged_14d          INTEGER NOT NULL DEFAULT 0,
    avg_merge_hours     REAL    NOT NULL DEFAULT 0,
    ci_failures         INTEGER NOT NULL DEFAULT 0,
    conflicts           INTEGER NOT NULL DEFAULT 0,
    stale_prs           INTEGER NOT NULL DEFAULT 0,
    changes_requested   INTEGER NOT NULL DEFAULT 0,
    total_additions     INTEGER NOT NULL DEFAULT 0,
    total_deletions     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at
    ON metrics_snapshots(recorded_at);
```

One row per poller cycle. At 5-min intervals this is ~8,640 rows/month -- negligible.

### 2. New Storage Methods (`internal/storage/metrics.go`)

| Method                                                        | Description                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| `InsertMetricsSnapshot(s MetricsSnapshot) error`              | Insert a row after each poll                                |
| `GetMetricsSnapshots(since time.Time) ([]MetricsSnapshot, error)` | Read history for trending charts                        |
| `PruneMetricsSnapshots(olderThan time.Time) (int64, error)`   | Cleanup rows older than retention period (90 days default)  |

### 3. Compute + Record in Poller (`internal/services/poller.go`)

After `emit(ctx, PollerEvent, result)` (currently line 359), call a new `recordMetrics(result)` function that:

- Counts `len(result.MyPRs)` -> `open_prs`
- Counts `len(result.ReviewRequests)` -> `pending_reviews`
- Counts `len(result.TeamReviewRequests)` -> `team_reviews`
- Counts `len(result.ReviewedByMe)` -> `reviewed_by_me`
- Counts `len(result.RecentMerged)` -> `merged_14d`
- Computes average `(mergedAt - createdAt).Hours()` across `RecentMerged` -> `avg_merge_hours`
- Iterates `MyPRs` for:
  - `checksStatus == "FAILURE"` -> `ci_failures`
  - `mergeable == "CONFLICTING"` -> `conflicts`
  - `reviewDecision == "CHANGES_REQUESTED"` -> `changes_requested`
  - `updatedAt` older than 7 days -> `stale_prs`
- Sums `additions`/`deletions` across `MyPRs` -> `total_additions`/`total_deletions`

### 4. New Service Method (`internal/services/pullrequest.go`)

| Method              | Signature                                              | Description                            |
| ------------------- | ------------------------------------------------------ | -------------------------------------- |
| `GetMetricsHistory` | `(daysBack int) ([]storage.MetricsSnapshot, error)`    | Exposed to frontend via Wails binding  |

## Frontend Changes

### 1. New Dependency

`recharts` -- installed via `npm install recharts`

### 2. New Route

`/metrics` -> `MetricsPage` (added to `App.tsx` + sidebar nav)

### 3. New Hook: `useMetrics.ts`

Combines both data sources:

- Calls `GetMetricsHistory(14)` on mount -> historical snapshots for trend charts
- Reads all items from Zustand `pageCache` via `getAllItems(key)` -> current breakdowns
- All computations wrapped in `useMemo`

### 4. Store Helper: `getAllItems(key)`

Added to `prStore.ts`. Iterates `pages[key].pageCache`, concatenates all `items` arrays sorted by page number. Returns the complete dataset for a category.

### 5. Components

| Component              | Chart Type              | Data Source                        | Description                                                    |
| ---------------------- | ----------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `MetricCard`           | Number                  | Current state                      | Summary stat with label, value, trend indicator                |
| `MergeVelocityChart`   | Area (recharts)         | Current `myRecentMerged`           | Merged PRs per day, last 14 days (buckets by `mergedAt`)       |
| `TrendChart`           | Line (recharts)         | Historical snapshots               | Open PR count / pending reviews / avg merge time over time     |
| `SizeDistribution`     | Bar (recharts)          | Current `myPRs` + `myRecentMerged` | Additions+deletions bucketed into XS/S/M/L/XL                 |
| `ReviewDecisionChart`  | Donut (recharts)        | Current `myPRs`                    | APPROVED / CHANGES_REQUESTED / REVIEW_REQUIRED breakdown       |
| `CIHealthChart`        | Donut (recharts)        | Current `myPRs`                    | SUCCESS / FAILURE / PENDING breakdown                          |
| `RepoBreakdown`        | Horizontal bar (recharts) | Current all categories           | PRs per repository                                             |
| `AttentionTable`       | Table (no chart)        | Current `myPRs`                    | Conflicts, CI failures, changes requested, stale >7d           |

## Page Layout

```
+-----------------------------------------------------+
|  Row 1: Summary Cards                               |
|  +------+ +----------+ +----------+ +--------------+|
|  |Open  | |Pending   | |Merged    | |Avg Time to   ||
|  |PRs   | |Reviews   | |(14d)     | |Merge         ||
|  +------+ +----------+ +----------+ +--------------+|
+-----------------------------------------------------+
|  Row 2: Merge Velocity (area chart, 14 days)        |
+-----------------------------------------------------+
|  Row 3: Trend Lines (from historical snapshots)     |
|  Open PRs over time  |  Pending reviews over time   |
+-----------+-----------+-----------------------------+
|  Row 4:   |           |                             |
|  PR Size  |  Review   |  CI Health                  |
|  Distrib. |  Decision |  Donut                      |
|  (bar)    |  (donut)  |                             |
+-----------+-----------+-----------------------------+
|  Row 5: Review Activity                             |
|  Queue age distribution  |  Decisions given (donut) |
+-----------------------------------------------------+
|  Row 6: Repository Distribution (horiz bar)         |
+-----------------------------------------------------+
|  Row 7: Attention Needed (table)                    |
|  PR | Issue | Repo | Age                            |
+-----------------------------------------------------+
```

## Files

| File                                    | Action       | Purpose                                       |
| --------------------------------------- | ------------ | --------------------------------------------- |
| `internal/storage/migrations.go`        | Modify       | Add migration 6                               |
| `internal/storage/metrics.go`           | **Create**   | `MetricsSnapshot` type + CRUD methods         |
| `internal/services/poller.go`           | Modify       | Add `recordMetrics()` call after emit         |
| `internal/services/pullrequest.go`      | Modify       | Add `GetMetricsHistory` service method        |
| `frontend/src/pages/MetricsPage.tsx`    | **Create**   | Main page                                     |
| `frontend/src/hooks/useMetrics.ts`      | **Create**   | Data hook                                     |
| `frontend/src/stores/prStore.ts`        | Modify       | Add `getAllItems()` helper                    |
| `frontend/src/App.tsx`                  | Modify       | Add `/metrics` route                          |
| Sidebar/layout nav                      | Modify       | Add nav link                                  |
| `frontend/wailsjs/go/...`              | Regenerated  | Wails bindings                                |

## Implementation Order

1. Backend: Add migration 6 + `MetricsSnapshot` model + storage methods
2. Backend: Add `computeSnapshot` function + call in poller after emit
3. Backend: Add `GetMetricsHistory` service method
4. Run `wails generate module` to produce frontend bindings
5. Frontend: `npm install recharts`
6. Frontend: Add `getAllItems` helper to `prStore.ts`
7. Frontend: Create `useMetrics` hook
8. Frontend: Build `MetricCard` + summary row
9. Frontend: Build chart components (merge velocity, trends, breakdowns)
10. Frontend: Build attention table
11. Frontend: Assemble `MetricsPage`, add route + nav link
12. Build + verify

## Reference: Size Thresholds

Used for PR size distribution chart.

| Label | Lines Changed (additions + deletions) |
| ----- | ------------------------------------- |
| XS    | 0-9                                   |
| S     | 10-49                                 |
| M     | 50-249                                |
| L     | 250-999                               |
| XL    | 1000+                                 |

## Reference: Attention Flags

| Flag              | Condition                                     |
| ----------------- | --------------------------------------------- |
| Conflicts         | `mergeable === "CONFLICTING"`                 |
| CI failure        | `checksStatus === "FAILURE"`                  |
| Changes requested | `reviewDecision === "CHANGES_REQUESTED"`      |
| Stale             | Open PR with `updatedAt` older than 7 days    |
