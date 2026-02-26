package storage

import (
	"fmt"

	gh "review-deck/internal/github"
)

// TrackedTeam represents a team the user can enable/disable for review tracking.
type TrackedTeam struct {
	OrgName  string `json:"orgName"`
	TeamSlug string `json:"teamSlug"`
	TeamName string `json:"teamName"`
	Enabled  bool   `json:"enabled"`
}

// UpsertTrackedTeams inserts or updates the tracked teams for an org.
// New teams are enabled by default; existing teams keep their enabled state.
func (db *DB) UpsertTrackedTeams(org string, teams []gh.Team) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	stmt, err := tx.Prepare(
		`INSERT INTO tracked_teams (org_name, team_slug, team_name, enabled)
		 VALUES (?, ?, ?, 1)
		 ON CONFLICT(org_name, team_slug) DO UPDATE SET team_name = excluded.team_name`,
	)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("prepare upsert: %w", err)
	}
	defer stmt.Close()

	for _, t := range teams {
		if _, err := stmt.Exec(org, t.Slug, t.Name); err != nil {
			tx.Rollback()
			return fmt.Errorf("upsert team %s: %w", t.Slug, err)
		}
	}

	return tx.Commit()
}

// GetTrackedTeams returns all tracked teams for an org.
func (db *DB) GetTrackedTeams(org string) ([]TrackedTeam, error) {
	rows, err := db.conn.Query(
		"SELECT org_name, team_slug, team_name, enabled FROM tracked_teams WHERE org_name = ? ORDER BY team_name ASC",
		org,
	)
	if err != nil {
		return nil, fmt.Errorf("get tracked teams: %w", err)
	}
	defer rows.Close()

	var teams []TrackedTeam
	for rows.Next() {
		var t TrackedTeam
		var enabled int
		if err := rows.Scan(&t.OrgName, &t.TeamSlug, &t.TeamName, &enabled); err != nil {
			return nil, err
		}
		t.Enabled = enabled == 1
		teams = append(teams, t)
	}
	return teams, rows.Err()
}

// GetEnabledTeamSlugs returns just the slugs of enabled teams for an org.
func (db *DB) GetEnabledTeamSlugs(org string) ([]string, error) {
	rows, err := db.conn.Query(
		"SELECT team_slug FROM tracked_teams WHERE org_name = ? AND enabled = 1 ORDER BY team_name ASC",
		org,
	)
	if err != nil {
		return nil, fmt.Errorf("get enabled teams: %w", err)
	}
	defer rows.Close()

	var slugs []string
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err != nil {
			return nil, err
		}
		slugs = append(slugs, slug)
	}
	return slugs, rows.Err()
}

// GetDisabledTeamSlugs returns the slugs of all disabled teams across all orgs.
func (db *DB) GetDisabledTeamSlugs() (map[string]bool, error) {
	rows, err := db.conn.Query(
		"SELECT team_slug FROM tracked_teams WHERE enabled = 0",
	)
	if err != nil {
		return nil, fmt.Errorf("get disabled teams: %w", err)
	}
	defer rows.Close()

	slugs := make(map[string]bool)
	for rows.Next() {
		var slug string
		if err := rows.Scan(&slug); err != nil {
			return nil, err
		}
		slugs[slug] = true
	}
	return slugs, rows.Err()
}

// SetTeamEnabled enables or disables a tracked team.
func (db *DB) SetTeamEnabled(org, slug string, enabled bool) error {
	val := 0
	if enabled {
		val = 1
	}
	_, err := db.conn.Exec(
		"UPDATE tracked_teams SET enabled = ? WHERE org_name = ? AND team_slug = ?",
		val, org, slug,
	)
	if err != nil {
		return fmt.Errorf("set team enabled: %w", err)
	}
	return nil
}
