package storage

import (
	"fmt"
	"time"

	gh "review-deck/internal/github"
)

// UpsertOrgMembers replaces all cached members for an org with the given list.
// This is done in a single transaction: delete old rows, insert new ones.
func (db *DB) UpsertOrgMembers(org string, members []gh.User) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	if _, err := tx.Exec("DELETE FROM org_members WHERE org_name = ?", org); err != nil {
		tx.Rollback()
		return fmt.Errorf("delete old org members: %w", err)
	}

	stmt, err := tx.Prepare(
		"INSERT INTO org_members (node_id, org_name, login, name, avatar_url, synced_at) VALUES (?, ?, ?, ?, ?, ?)",
	)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer stmt.Close()

	now := time.Now()
	for _, m := range members {
		if _, err := stmt.Exec(m.NodeID, org, m.Login, m.Name, m.AvatarURL, now); err != nil {
			tx.Rollback()
			return fmt.Errorf("insert org member %s: %w", m.Login, err)
		}
	}

	return tx.Commit()
}

// GetOrgMembers returns ALL cached members for an org, ordered by login.
func (db *DB) GetOrgMembers(org string) ([]gh.User, error) {
	rows, err := db.conn.Query(
		"SELECT node_id, login, name, avatar_url FROM org_members WHERE org_name = ? ORDER BY login ASC",
		org,
	)
	if err != nil {
		return nil, fmt.Errorf("get org members: %w", err)
	}
	defer rows.Close()

	var users []gh.User
	for rows.Next() {
		var u gh.User
		if err := rows.Scan(&u.NodeID, &u.Login, &u.Name, &u.AvatarURL); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// SearchOrgMembers searches cached org members by login or name prefix.
// Returns up to 20 results ordered by login.
func (db *DB) SearchOrgMembers(org string, query string) ([]gh.User, error) {
	pattern := "%" + query + "%"
	rows, err := db.conn.Query(
		`SELECT node_id, login, name, avatar_url FROM org_members
		 WHERE org_name = ? AND (login LIKE ? OR name LIKE ?)
		 ORDER BY login ASC LIMIT 20`,
		org, pattern, pattern,
	)
	if err != nil {
		return nil, fmt.Errorf("search org members: %w", err)
	}
	defer rows.Close()

	var users []gh.User
	for rows.Next() {
		var u gh.User
		if err := rows.Scan(&u.NodeID, &u.Login, &u.Name, &u.AvatarURL); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// GetOrgMembersSyncedAt returns the last sync time for an org's member cache.
// Returns zero time if no members are cached.
func (db *DB) GetOrgMembersSyncedAt(org string) (time.Time, error) {
	var syncedAt time.Time
	err := db.conn.QueryRow(
		"SELECT MAX(synced_at) FROM org_members WHERE org_name = ?", org,
	).Scan(&syncedAt)
	if err != nil {
		return time.Time{}, nil // no rows = never synced
	}
	return syncedAt, nil
}

// GetOrgMemberCount returns the number of cached members for an org.
func (db *DB) GetOrgMemberCount(org string) (int, error) {
	var count int
	err := db.conn.QueryRow(
		"SELECT COUNT(*) FROM org_members WHERE org_name = ?", org,
	).Scan(&count)
	return count, err
}
