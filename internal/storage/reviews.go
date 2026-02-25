package storage

import (
	"fmt"

	gh "pull-request-reviewing/internal/github"
)

// GetReviewsForPR returns all reviews for a given pull request.
func (db *DB) GetReviewsForPR(prNodeID string) ([]gh.Review, error) {
	rows, err := db.conn.Query(
		"SELECT id, author_login, author_avatar, state, body, submitted_at FROM reviews WHERE pr_node_id = ? ORDER BY submitted_at DESC",
		prNodeID,
	)
	if err != nil {
		return nil, fmt.Errorf("query reviews: %w", err)
	}
	defer rows.Close()

	var reviews []gh.Review
	for rows.Next() {
		var r gh.Review
		if err := rows.Scan(&r.ID, &r.Author, &r.AuthorAvatar, &r.State, &r.Body, &r.SubmittedAt); err != nil {
			return nil, fmt.Errorf("scan review: %w", err)
		}
		reviews = append(reviews, r)
	}
	return reviews, rows.Err()
}
