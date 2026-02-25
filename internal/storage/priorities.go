package storage

import (
	"fmt"
	"time"
)

// ReviewPriority represents a prioritised user or team for review triage.
type ReviewPriority struct {
	ID        int       `json:"id"`
	OrgName   string    `json:"orgName"`
	Name      string    `json:"name"`
	Type      string    `json:"type"` // "user" or "team"
	Priority  int       `json:"priority"`
	CreatedAt time.Time `json:"createdAt"`
}

// GetReviewPriorities returns all review priorities for an org, ordered by priority descending.
func (db *DB) GetReviewPriorities(org string) ([]ReviewPriority, error) {
	rows, err := db.conn.Query(
		"SELECT id, org_name, name, type, priority, created_at FROM review_priorities WHERE org_name = ? ORDER BY priority DESC",
		org,
	)
	if err != nil {
		return nil, fmt.Errorf("query review priorities: %w", err)
	}
	defer rows.Close()

	var priorities []ReviewPriority
	for rows.Next() {
		var p ReviewPriority
		if err := rows.Scan(&p.ID, &p.OrgName, &p.Name, &p.Type, &p.Priority, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan review priority: %w", err)
		}
		priorities = append(priorities, p)
	}
	return priorities, rows.Err()
}

// AddReviewPriority adds a new review priority entry. The priority is set to max+1.
func (db *DB) AddReviewPriority(org, name, typeName string) error {
	var maxPriority int
	row := db.conn.QueryRow(
		"SELECT COALESCE(MAX(priority), 0) FROM review_priorities WHERE org_name = ?", org,
	)
	if err := row.Scan(&maxPriority); err != nil {
		return fmt.Errorf("get max priority: %w", err)
	}

	_, err := db.conn.Exec(
		"INSERT INTO review_priorities (org_name, name, type, priority) VALUES (?, ?, ?, ?) ON CONFLICT(org_name, name, type) DO NOTHING",
		org, name, typeName, maxPriority+1,
	)
	if err != nil {
		return fmt.Errorf("insert review priority: %w", err)
	}
	return nil
}

// RemoveReviewPriority removes a review priority entry.
func (db *DB) RemoveReviewPriority(org, name, typeName string) error {
	_, err := db.conn.Exec(
		"DELETE FROM review_priorities WHERE org_name = ? AND name = ? AND type = ?",
		org, name, typeName,
	)
	if err != nil {
		return fmt.Errorf("delete review priority: %w", err)
	}
	return nil
}

// UpdateReviewPriorityOrder updates the priority value for an entry.
func (db *DB) UpdateReviewPriorityOrder(org, name, typeName string, priority int) error {
	_, err := db.conn.Exec(
		"UPDATE review_priorities SET priority = ? WHERE org_name = ? AND name = ? AND type = ?",
		priority, org, name, typeName,
	)
	if err != nil {
		return fmt.Errorf("update review priority order: %w", err)
	}
	return nil
}
