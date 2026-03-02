package storage

import (
	"fmt"

	gh "review-deck/internal/github"
)

// UpsertRepoLabels replaces all cached labels for a repo with the given set.
func (db *DB) UpsertRepoLabels(owner, repo string, labels []gh.Label) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	// Clear existing labels for this repo.
	if _, err := tx.Exec(
		"DELETE FROM repo_labels WHERE repo_owner = ? AND repo_name = ?",
		owner, repo,
	); err != nil {
		tx.Rollback()
		return fmt.Errorf("delete old labels: %w", err)
	}

	stmt, err := tx.Prepare(
		`INSERT INTO repo_labels (repo_owner, repo_name, label_id, label_name, label_color)
		 VALUES (?, ?, ?, ?, ?)`,
	)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer stmt.Close()

	for _, l := range labels {
		if _, err := stmt.Exec(owner, repo, l.ID, l.Name, l.Color); err != nil {
			tx.Rollback()
			return fmt.Errorf("insert label %s: %w", l.Name, err)
		}
	}

	return tx.Commit()
}

// GetRepoLabels returns all cached labels for a repo, ordered by name.
func (db *DB) GetRepoLabels(owner, repo string) ([]gh.Label, error) {
	rows, err := db.conn.Query(
		"SELECT label_id, label_name, label_color FROM repo_labels WHERE repo_owner = ? AND repo_name = ? ORDER BY label_name ASC",
		owner, repo,
	)
	if err != nil {
		return nil, fmt.Errorf("get repo labels: %w", err)
	}
	defer rows.Close()

	var labels []gh.Label
	for rows.Next() {
		var l gh.Label
		if err := rows.Scan(&l.ID, &l.Name, &l.Color); err != nil {
			return nil, err
		}
		labels = append(labels, l)
	}
	return labels, rows.Err()
}
