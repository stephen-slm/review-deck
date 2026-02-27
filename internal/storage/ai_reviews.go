package storage

import (
	"database/sql"
	"fmt"
	"time"
)

// AIReview represents a cached Claude AI review for a pull request.
type AIReview struct {
	ID         int       `json:"id"`
	PRNodeID   string    `json:"pr_node_id"`
	RepoOwner  string    `json:"repo_owner"`
	RepoName   string    `json:"repo_name"`
	PRNumber   int       `json:"pr_number"`
	Review     string    `json:"review"`
	Cost       float64   `json:"cost"`
	DurationMs int       `json:"duration_ms"`
	CreatedAt  time.Time `json:"created_at"`
}

const aiReviewTTL = 7 * 24 * time.Hour // 1 week

// SaveAIReview upserts an AI review for the given PR.
func (db *DB) SaveAIReview(prNodeID, repoOwner, repoName string, prNumber int, review string, cost float64, durationMs int) error {
	_, err := db.conn.Exec(`
		INSERT INTO ai_reviews (pr_node_id, repo_owner, repo_name, pr_number, review, cost, duration_ms, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(pr_node_id) DO UPDATE SET
			review = excluded.review,
			cost = excluded.cost,
			duration_ms = excluded.duration_ms,
			created_at = CURRENT_TIMESTAMP`,
		prNodeID, repoOwner, repoName, prNumber, review, cost, durationMs,
	)
	if err != nil {
		return fmt.Errorf("save ai review: %w", err)
	}
	return nil
}

// GetAIReview returns the cached AI review for a PR, or nil if not found or expired (>7 days).
func (db *DB) GetAIReview(prNodeID string) (*AIReview, error) {
	var r AIReview
	err := db.conn.QueryRow(`
		SELECT id, pr_node_id, repo_owner, repo_name, pr_number, review, cost, duration_ms, created_at
		FROM ai_reviews
		WHERE pr_node_id = ?`,
		prNodeID,
	).Scan(&r.ID, &r.PRNodeID, &r.RepoOwner, &r.RepoName, &r.PRNumber, &r.Review, &r.Cost, &r.DurationMs, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get ai review: %w", err)
	}

	// Check TTL — return nil if older than 7 days.
	if time.Since(r.CreatedAt) > aiReviewTTL {
		return nil, nil
	}

	return &r, nil
}

// DeleteExpiredAIReviews removes AI reviews older than 7 days.
func (db *DB) DeleteExpiredAIReviews() error {
	_, err := db.conn.Exec("DELETE FROM ai_reviews WHERE created_at < datetime('now', '-7 days')")
	if err != nil {
		return fmt.Errorf("delete expired ai reviews: %w", err)
	}
	return nil
}
