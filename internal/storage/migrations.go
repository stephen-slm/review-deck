package storage

import "fmt"

// migrations is an ordered list of SQL migration statements.
// Each entry is run exactly once, tracked by the schema_version table.
var migrations = []string{
	// Migration 0: Create the schema version tracker.
	`CREATE TABLE IF NOT EXISTS schema_version (
		version INTEGER PRIMARY KEY
	)`,

	// Migration 1: Core tables.
	`CREATE TABLE IF NOT EXISTS settings (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS tracked_orgs (
		id       INTEGER PRIMARY KEY AUTOINCREMENT,
		org_name TEXT NOT NULL UNIQUE,
		enabled  INTEGER DEFAULT 1
	);

	CREATE TABLE IF NOT EXISTS pull_requests (
		node_id         TEXT PRIMARY KEY,
		number          INTEGER NOT NULL,
		repo_owner      TEXT NOT NULL,
		repo_name       TEXT NOT NULL,
		title           TEXT NOT NULL,
		state           TEXT NOT NULL,
		author_login    TEXT NOT NULL,
		author_avatar   TEXT,
		is_draft        INTEGER DEFAULT 0,
		additions       INTEGER DEFAULT 0,
		deletions       INTEGER DEFAULT 0,
		changed_files   INTEGER DEFAULT 0,
		commits_count   INTEGER DEFAULT 0,
		mergeable       TEXT,
		review_decision TEXT,
		head_ref        TEXT,
		base_ref        TEXT,
		url             TEXT NOT NULL,
		body            TEXT,
		checks_status   TEXT,
		merged_by       TEXT,
		created_at      DATETIME NOT NULL,
		updated_at      DATETIME NOT NULL,
		merged_at       DATETIME,
		closed_at       DATETIME,
		last_synced_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS reviews (
		id           TEXT PRIMARY KEY,
		pr_node_id   TEXT NOT NULL REFERENCES pull_requests(node_id) ON DELETE CASCADE,
		author_login TEXT NOT NULL,
		author_avatar TEXT,
		state        TEXT NOT NULL,
		body         TEXT,
		submitted_at DATETIME NOT NULL
	);

	CREATE TABLE IF NOT EXISTS review_requests (
		id           INTEGER PRIMARY KEY AUTOINCREMENT,
		pr_node_id   TEXT NOT NULL REFERENCES pull_requests(node_id) ON DELETE CASCADE,
		reviewer     TEXT NOT NULL,
		reviewer_type TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS notifications (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		pr_node_id TEXT REFERENCES pull_requests(node_id) ON DELETE SET NULL,
		event_type TEXT NOT NULL,
		title      TEXT NOT NULL,
		message    TEXT,
		read       INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS hooks (
		id            INTEGER PRIMARY KEY AUTOINCREMENT,
		name          TEXT NOT NULL,
		event_type    TEXT NOT NULL,
		action_type   TEXT NOT NULL,
		action_config TEXT NOT NULL,
		enabled       INTEGER DEFAULT 1,
		created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_pr_author ON pull_requests(author_login);
	CREATE INDEX IF NOT EXISTS idx_pr_state ON pull_requests(state);
	CREATE INDEX IF NOT EXISTS idx_pr_repo ON pull_requests(repo_owner, repo_name);
	CREATE INDEX IF NOT EXISTS idx_reviews_pr ON reviews(pr_node_id);
	CREATE INDEX IF NOT EXISTS idx_review_requests_pr ON review_requests(pr_node_id);
	CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);`,

	// Migration 2: Org members cache for reviewer assignment.
	`CREATE TABLE IF NOT EXISTS org_members (
		node_id    TEXT NOT NULL,
		org_name   TEXT NOT NULL,
		login      TEXT NOT NULL,
		name       TEXT,
		avatar_url TEXT,
		synced_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (org_name, login)
	);

	CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_name);`,

	// Migration 3: Tracked teams for team review request filtering.
	`CREATE TABLE IF NOT EXISTS tracked_teams (
		id        INTEGER PRIMARY KEY AUTOINCREMENT,
		org_name  TEXT NOT NULL,
		team_slug TEXT NOT NULL,
		team_name TEXT NOT NULL,
		enabled   INTEGER DEFAULT 1,
		UNIQUE(org_name, team_slug)
	);

	CREATE INDEX IF NOT EXISTS idx_tracked_teams_org ON tracked_teams(org_name);`,

	// Migration 4: Priority reviewers for review request triage.
	`CREATE TABLE IF NOT EXISTS review_priorities (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		org_name   TEXT NOT NULL,
		name       TEXT NOT NULL,
		type       TEXT NOT NULL CHECK(type IN ('user', 'team')),
		priority   INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(org_name, name, type)
	);

	CREATE INDEX IF NOT EXISTS idx_review_priorities_org ON review_priorities(org_name);`,

	// Migration 5: Excluded repositories for per-org repo filtering.
	`CREATE TABLE IF NOT EXISTS excluded_repos (
		id        INTEGER PRIMARY KEY AUTOINCREMENT,
		org_name  TEXT NOT NULL,
		repo_name TEXT NOT NULL,
		UNIQUE(org_name, repo_name)
	);

	CREATE INDEX IF NOT EXISTS idx_excluded_repos_org ON excluded_repos(org_name);`,
}

// Migrate runs all pending migrations.
func (db *DB) Migrate() error {
	// Ensure the version table exists.
	if _, err := db.conn.Exec(migrations[0]); err != nil {
		return fmt.Errorf("create schema_version table: %w", err)
	}

	// Get current version.
	var currentVersion int
	row := db.conn.QueryRow("SELECT COALESCE(MAX(version), 0) FROM schema_version")
	if err := row.Scan(&currentVersion); err != nil {
		return fmt.Errorf("get schema version: %w", err)
	}

	// Run pending migrations (starting from index 1 since 0 is the version table).
	for i := currentVersion + 1; i < len(migrations); i++ {
		tx, err := db.conn.Begin()
		if err != nil {
			return fmt.Errorf("begin tx for migration %d: %w", i, err)
		}

		if _, err := tx.Exec(migrations[i]); err != nil {
			tx.Rollback()
			return fmt.Errorf("run migration %d: %w", i, err)
		}

		if _, err := tx.Exec("INSERT INTO schema_version (version) VALUES (?)", i); err != nil {
			tx.Rollback()
			return fmt.Errorf("record migration %d: %w", i, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %d: %w", i, err)
		}
	}

	return nil
}
