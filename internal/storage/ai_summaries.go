package storage

import (
	"database/sql"
	"fmt"
	"time"
)

// AISummary represents a cached AI summary for a pull request.
type AISummary struct {
	ID         int       `json:"id"`
	PRNodeID   string    `json:"pr_node_id"`
	RepoOwner  string    `json:"repo_owner"`
	RepoName   string    `json:"repo_name"`
	PRNumber   int       `json:"pr_number"`
	Summary    string    `json:"summary"`
	Cost       float64   `json:"cost"`
	DurationMs int       `json:"duration_ms"`
	CreatedAt  time.Time `json:"created_at"`
}

const aiSummaryTTL = 7 * 24 * time.Hour // 1 week

// SaveAISummary upserts an AI summary for the given PR.
func (db *DB) SaveAISummary(prNodeID, repoOwner, repoName string, prNumber int, summary string, cost float64, durationMs int) error {
	_, err := db.conn.Exec(`
		INSERT INTO ai_summaries (pr_node_id, repo_owner, repo_name, pr_number, summary, cost, duration_ms, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(pr_node_id) DO UPDATE SET
			summary = excluded.summary,
			cost = excluded.cost,
			duration_ms = excluded.duration_ms,
			created_at = CURRENT_TIMESTAMP`,
		prNodeID, repoOwner, repoName, prNumber, summary, cost, durationMs,
	)
	if err != nil {
		return fmt.Errorf("save ai summary: %w", err)
	}
	return nil
}

// GetAISummary returns the cached AI summary for a PR, or nil if not found or expired.
func (db *DB) GetAISummary(prNodeID string) (*AISummary, error) {
	var s AISummary
	err := db.conn.QueryRow(`
		SELECT id, pr_node_id, repo_owner, repo_name, pr_number, summary, cost, duration_ms, created_at
		FROM ai_summaries
		WHERE pr_node_id = ?`,
		prNodeID,
	).Scan(&s.ID, &s.PRNodeID, &s.RepoOwner, &s.RepoName, &s.PRNumber, &s.Summary, &s.Cost, &s.DurationMs, &s.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get ai summary: %w", err)
	}

	if time.Since(s.CreatedAt) > aiSummaryTTL {
		return nil, nil
	}

	return &s, nil
}

// DeleteAISummary removes a cached AI summary for a specific PR.
func (db *DB) DeleteAISummary(prNodeID string) error {
	_, err := db.conn.Exec("DELETE FROM ai_summaries WHERE pr_node_id = ?", prNodeID)
	if err != nil {
		return fmt.Errorf("delete ai summary: %w", err)
	}
	return nil
}
