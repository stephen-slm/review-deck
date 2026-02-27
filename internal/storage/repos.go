package storage

import (
	"fmt"
	"time"
)

// TrackedRepo represents a locally-tracked Git repository linked to a GitHub remote.
type TrackedRepo struct {
	ID        int       `json:"id"`
	LocalPath string    `json:"localPath"`
	RepoOwner string    `json:"repoOwner"`
	RepoName  string    `json:"repoName"`
	RemoteURL string    `json:"remoteURL"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"createdAt"`
	AIAgent   string    `json:"aiAgent"` // "claude", "codex", or "" (use global default)
}

// InsertTrackedRepo adds a new tracked repository. If a repo with the same
// owner/name already exists, it is re-enabled and the local path + remote URL
// are updated.
func (db *DB) InsertTrackedRepo(localPath, repoOwner, repoName, remoteURL string) (*TrackedRepo, error) {
	res, err := db.conn.Exec(`
		INSERT INTO tracked_repos (local_path, repo_owner, repo_name, remote_url, enabled)
		VALUES (?, ?, ?, ?, 1)
		ON CONFLICT(repo_owner, repo_name) DO UPDATE SET
			local_path = excluded.local_path,
			remote_url = excluded.remote_url,
			enabled    = 1
	`, localPath, repoOwner, repoName, remoteURL)
	if err != nil {
		return nil, fmt.Errorf("insert tracked repo: %w", err)
	}

	id, _ := res.LastInsertId()

	// If it was an upsert, LastInsertId may be 0 — fetch by unique key.
	if id == 0 {
		return db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	}

	return &TrackedRepo{
		ID:        int(id),
		LocalPath: localPath,
		RepoOwner: repoOwner,
		RepoName:  repoName,
		RemoteURL: remoteURL,
		Enabled:   true,
		CreatedAt: time.Now(),
	}, nil
}

// GetTrackedRepos returns all enabled tracked repositories.
func (db *DB) GetTrackedRepos() ([]TrackedRepo, error) {
	rows, err := db.conn.Query(`
		SELECT id, local_path, repo_owner, repo_name, remote_url, enabled, created_at, ai_agent
		FROM tracked_repos
		WHERE enabled = 1
		ORDER BY repo_owner, repo_name
	`)
	if err != nil {
		return nil, fmt.Errorf("get tracked repos: %w", err)
	}
	defer rows.Close()

	var repos []TrackedRepo
	for rows.Next() {
		var r TrackedRepo
		if err := rows.Scan(&r.ID, &r.LocalPath, &r.RepoOwner, &r.RepoName, &r.RemoteURL, &r.Enabled, &r.CreatedAt, &r.AIAgent); err != nil {
			return nil, err
		}
		repos = append(repos, r)
	}
	return repos, rows.Err()
}

// GetTrackedRepoByID returns a tracked repo by its primary key.
func (db *DB) GetTrackedRepoByID(id int) (*TrackedRepo, error) {
	var r TrackedRepo
	err := db.conn.QueryRow(`
		SELECT id, local_path, repo_owner, repo_name, remote_url, enabled, created_at, ai_agent
		FROM tracked_repos WHERE id = ?
	`, id).Scan(&r.ID, &r.LocalPath, &r.RepoOwner, &r.RepoName, &r.RemoteURL, &r.Enabled, &r.CreatedAt, &r.AIAgent)
	if err != nil {
		return nil, fmt.Errorf("get tracked repo %d: %w", id, err)
	}
	return &r, nil
}

// GetTrackedRepoByOwnerName returns a tracked repo by owner/name.
func (db *DB) GetTrackedRepoByOwnerName(owner, name string) (*TrackedRepo, error) {
	var r TrackedRepo
	err := db.conn.QueryRow(`
		SELECT id, local_path, repo_owner, repo_name, remote_url, enabled, created_at, ai_agent
		FROM tracked_repos WHERE repo_owner = ? AND repo_name = ?
	`, owner, name).Scan(&r.ID, &r.LocalPath, &r.RepoOwner, &r.RepoName, &r.RemoteURL, &r.Enabled, &r.CreatedAt, &r.AIAgent)
	if err != nil {
		return nil, fmt.Errorf("get tracked repo %s/%s: %w", owner, name, err)
	}
	return &r, nil
}

// DisableTrackedRepo soft-deletes a tracked repository.
func (db *DB) DisableTrackedRepo(id int) error {
	_, err := db.conn.Exec("UPDATE tracked_repos SET enabled = 0 WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("disable tracked repo %d: %w", id, err)
	}
	return nil
}

// SetRepoAIAgent updates the default AI agent for a tracked repo.
// Valid values: "claude", "codex", or "" (use global default).
func (db *DB) SetRepoAIAgent(id int, agent string) error {
	_, err := db.conn.Exec("UPDATE tracked_repos SET ai_agent = ? WHERE id = ?", agent, id)
	if err != nil {
		return fmt.Errorf("set repo ai agent %d: %w", id, err)
	}
	return nil
}

// GetUniqueRepoOwners returns the distinct owners from all enabled tracked repos.
// This replaces the org-level tracking — orgs are now derived from repos.
func (db *DB) GetUniqueRepoOwners() ([]string, error) {
	rows, err := db.conn.Query("SELECT DISTINCT repo_owner FROM tracked_repos WHERE enabled = 1 ORDER BY repo_owner")
	if err != nil {
		return nil, fmt.Errorf("get unique repo owners: %w", err)
	}
	defer rows.Close()

	var owners []string
	for rows.Next() {
		var owner string
		if err := rows.Scan(&owner); err != nil {
			return nil, err
		}
		owners = append(owners, owner)
	}
	return owners, rows.Err()
}
