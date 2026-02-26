package storage

import (
	"fmt"
	"time"
)

// MetricsSnapshot represents a single point-in-time metrics recording.
type MetricsSnapshot struct {
	ID               int       `json:"id"`
	RecordedAt       time.Time `json:"recordedAt"`
	OpenPRs          int       `json:"openPRs"`
	PendingReviews   int       `json:"pendingReviews"`
	TeamReviews      int       `json:"teamReviews"`
	ReviewedByMe     int       `json:"reviewedByMe"`
	Merged14d        int       `json:"merged14d"`
	AvgMergeHours    float64   `json:"avgMergeHours"`
	CIFailures       int       `json:"ciFailures"`
	Conflicts        int       `json:"conflicts"`
	StalePRs         int       `json:"stalePRs"`
	ChangesRequested int       `json:"changesRequested"`
	TotalAdditions   int       `json:"totalAdditions"`
	TotalDeletions   int       `json:"totalDeletions"`
}

// InsertMetricsSnapshot records a single metrics snapshot.
func (db *DB) InsertMetricsSnapshot(s MetricsSnapshot) error {
	_, err := db.conn.Exec(`
		INSERT INTO metrics_snapshots (
			recorded_at, open_prs, pending_reviews, team_reviews, reviewed_by_me,
			merged_14d, avg_merge_hours, ci_failures, conflicts,
			stale_prs, changes_requested, total_additions, total_deletions
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.RecordedAt,
		s.OpenPRs, s.PendingReviews, s.TeamReviews, s.ReviewedByMe,
		s.Merged14d, s.AvgMergeHours, s.CIFailures, s.Conflicts,
		s.StalePRs, s.ChangesRequested, s.TotalAdditions, s.TotalDeletions,
	)
	if err != nil {
		return fmt.Errorf("insert metrics snapshot: %w", err)
	}
	return nil
}

// GetMetricsSnapshots returns all snapshots recorded after the given time.
func (db *DB) GetMetricsSnapshots(since time.Time) ([]MetricsSnapshot, error) {
	rows, err := db.conn.Query(`
		SELECT id, recorded_at, open_prs, pending_reviews, team_reviews, reviewed_by_me,
		       merged_14d, avg_merge_hours, ci_failures, conflicts,
		       stale_prs, changes_requested, total_additions, total_deletions
		FROM metrics_snapshots
		WHERE recorded_at >= ?
		ORDER BY recorded_at ASC`, since)
	if err != nil {
		return nil, fmt.Errorf("query metrics snapshots: %w", err)
	}
	defer rows.Close()

	var snapshots []MetricsSnapshot
	for rows.Next() {
		var s MetricsSnapshot
		if err := rows.Scan(
			&s.ID, &s.RecordedAt,
			&s.OpenPRs, &s.PendingReviews, &s.TeamReviews, &s.ReviewedByMe,
			&s.Merged14d, &s.AvgMergeHours, &s.CIFailures, &s.Conflicts,
			&s.StalePRs, &s.ChangesRequested, &s.TotalAdditions, &s.TotalDeletions,
		); err != nil {
			return nil, fmt.Errorf("scan metrics snapshot: %w", err)
		}
		snapshots = append(snapshots, s)
	}
	return snapshots, rows.Err()
}

// PruneMetricsSnapshots deletes all snapshots older than the given time.
// Returns the number of rows deleted.
func (db *DB) PruneMetricsSnapshots(olderThan time.Time) (int64, error) {
	result, err := db.conn.Exec(`DELETE FROM metrics_snapshots WHERE recorded_at < ?`, olderThan)
	if err != nil {
		return 0, fmt.Errorf("prune metrics snapshots: %w", err)
	}
	return result.RowsAffected()
}
