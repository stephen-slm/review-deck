package storage

import (
	"database/sql"
	"time"
)

// CodeTour represents a cached AI-generated code tour for a pull request.
type CodeTour struct {
	ID         int
	PRNodeID   string
	RepoOwner  string
	RepoName   string
	PRNumber   int
	Tour       string // JSON string
	Cost       float64
	DurationMs int
	CreatedAt  time.Time
}

// SaveCodeTour upserts a code tour result.
func (db *DB) SaveCodeTour(prNodeID, repoOwner, repoName string, prNumber int, tour string, cost float64, durationMs int) error {
	_, err := db.conn.Exec(`
		INSERT INTO code_tours (pr_node_id, repo_owner, repo_name, pr_number, tour, cost, duration_ms)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(pr_node_id) DO UPDATE SET
			tour = excluded.tour,
			cost = excluded.cost,
			duration_ms = excluded.duration_ms,
			created_at = CURRENT_TIMESTAMP
	`, prNodeID, repoOwner, repoName, prNumber, tour, cost, durationMs)
	return err
}

// GetCodeTour retrieves a cached code tour if it exists and is less than 7 days old.
func (db *DB) GetCodeTour(prNodeID string) (*CodeTour, error) {
	row := db.conn.QueryRow(`
		SELECT id, pr_node_id, repo_owner, repo_name, pr_number, tour, cost, duration_ms, created_at
		FROM code_tours
		WHERE pr_node_id = ? AND created_at > datetime('now', '-7 days')
	`, prNodeID)

	var ct CodeTour
	err := row.Scan(&ct.ID, &ct.PRNodeID, &ct.RepoOwner, &ct.RepoName, &ct.PRNumber, &ct.Tour, &ct.Cost, &ct.DurationMs, &ct.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &ct, nil
}

// DeleteCodeTour removes a cached code tour for a PR.
func (db *DB) DeleteCodeTour(prNodeID string) error {
	_, err := db.conn.Exec(`DELETE FROM code_tours WHERE pr_node_id = ?`, prNodeID)
	return err
}

// DeleteExpiredCodeTours removes all code tours older than 7 days.
func (db *DB) DeleteExpiredCodeTours() error {
	_, err := db.conn.Exec(`DELETE FROM code_tours WHERE created_at <= datetime('now', '-7 days')`)
	return err
}
