package storage

import "fmt"

// GetExcludedRepos returns all excluded repository names for an org.
func (db *DB) GetExcludedRepos(org string) ([]string, error) {
	rows, err := db.conn.Query(
		"SELECT repo_name FROM excluded_repos WHERE org_name = ? ORDER BY repo_name",
		org,
	)
	if err != nil {
		return nil, fmt.Errorf("query excluded repos: %w", err)
	}
	defer rows.Close()

	var repos []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan excluded repo: %w", err)
		}
		repos = append(repos, name)
	}
	return repos, rows.Err()
}

// AddExcludedRepo adds a repository to the exclusion list for an org.
func (db *DB) AddExcludedRepo(org, repo string) error {
	_, err := db.conn.Exec(
		"INSERT INTO excluded_repos (org_name, repo_name) VALUES (?, ?) ON CONFLICT(org_name, repo_name) DO NOTHING",
		org, repo,
	)
	if err != nil {
		return fmt.Errorf("insert excluded repo: %w", err)
	}
	return nil
}

// RemoveExcludedRepo removes a repository from the exclusion list.
func (db *DB) RemoveExcludedRepo(org, repo string) error {
	_, err := db.conn.Exec(
		"DELETE FROM excluded_repos WHERE org_name = ? AND repo_name = ?",
		org, repo,
	)
	if err != nil {
		return fmt.Errorf("delete excluded repo: %w", err)
	}
	return nil
}
