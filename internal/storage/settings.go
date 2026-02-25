package storage

import "fmt"

// GetSetting retrieves a setting value by key.
func (db *DB) GetSetting(key string) (string, error) {
	var value string
	err := db.conn.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	if err != nil {
		return "", fmt.Errorf("get setting %q: %w", key, err)
	}
	return value, nil
}

// SetSetting stores a setting value. Upserts on key conflict.
func (db *DB) SetSetting(key, value string) error {
	_, err := db.conn.Exec(
		"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		key, value,
	)
	if err != nil {
		return fmt.Errorf("set setting %q: %w", key, err)
	}
	return nil
}

// DeleteSetting removes a setting by key.
func (db *DB) DeleteSetting(key string) error {
	_, err := db.conn.Exec("DELETE FROM settings WHERE key = ?", key)
	if err != nil {
		return fmt.Errorf("delete setting %q: %w", key, err)
	}
	return nil
}

// GetTrackedOrgs returns all tracked organizations.
func (db *DB) GetTrackedOrgs() ([]string, error) {
	rows, err := db.conn.Query("SELECT org_name FROM tracked_orgs WHERE enabled = 1")
	if err != nil {
		return nil, fmt.Errorf("get tracked orgs: %w", err)
	}
	defer rows.Close()

	var orgs []string
	for rows.Next() {
		var org string
		if err := rows.Scan(&org); err != nil {
			return nil, err
		}
		orgs = append(orgs, org)
	}
	return orgs, rows.Err()
}

// AddTrackedOrg adds an organization to track.
func (db *DB) AddTrackedOrg(org string) error {
	_, err := db.conn.Exec(
		"INSERT INTO tracked_orgs (org_name) VALUES (?) ON CONFLICT(org_name) DO UPDATE SET enabled = 1",
		org,
	)
	return err
}

// RemoveTrackedOrg disables tracking for an organization.
func (db *DB) RemoveTrackedOrg(org string) error {
	_, err := db.conn.Exec("UPDATE tracked_orgs SET enabled = 0 WHERE org_name = ?", org)
	return err
}
