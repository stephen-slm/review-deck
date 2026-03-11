package storage

import (
	"fmt"
	"time"
)

// AppNotification represents a stored notification for the inbox.
type AppNotification struct {
	ID        int64     `json:"id"`
	PRNodeID  string    `json:"prNodeId"`
	EventType string    `json:"eventType"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	Repo      string    `json:"repo"`
	Number    int       `json:"number"`
	URL       string    `json:"url"`
	Author    string    `json:"author"`
	Read      bool      `json:"read"`
	CreatedAt time.Time `json:"createdAt"`
}

// InsertNotification stores a new notification and returns its ID.
func (db *DB) InsertNotification(n AppNotification) (int64, error) {
	res, err := db.conn.Exec(
		`INSERT INTO notifications (pr_node_id, event_type, title, message, repo, number, url, author, read)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
		n.PRNodeID, n.EventType, n.Title, n.Message, n.Repo, n.Number, n.URL, n.Author,
	)
	if err != nil {
		return 0, fmt.Errorf("insert notification: %w", err)
	}
	return res.LastInsertId()
}

// GetNotifications returns notifications ordered by newest first, with optional limit.
// If limit <= 0, all notifications are returned.
func (db *DB) GetNotifications(limit int) ([]AppNotification, error) {
	query := `SELECT id, COALESCE(pr_node_id,''), event_type, title, COALESCE(message,''),
	                 repo, number, url, author, read, created_at
	          FROM notifications ORDER BY created_at DESC`
	if limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", limit)
	}

	rows, err := db.conn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query notifications: %w", err)
	}
	defer rows.Close()

	var notifications []AppNotification
	for rows.Next() {
		var n AppNotification
		var readInt int
		if err := rows.Scan(&n.ID, &n.PRNodeID, &n.EventType, &n.Title, &n.Message,
			&n.Repo, &n.Number, &n.URL, &n.Author, &readInt, &n.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan notification: %w", err)
		}
		n.Read = readInt != 0
		notifications = append(notifications, n)
	}
	return notifications, rows.Err()
}

// GetUnreadCount returns the number of unread notifications.
func (db *DB) GetUnreadCount() (int, error) {
	var count int
	err := db.conn.QueryRow("SELECT COUNT(*) FROM notifications WHERE read = 0").Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count unread notifications: %w", err)
	}
	return count, nil
}

// MarkNotificationRead marks a single notification as read.
func (db *DB) MarkNotificationRead(id int64) error {
	_, err := db.conn.Exec("UPDATE notifications SET read = 1 WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("mark notification read: %w", err)
	}
	return nil
}

// MarkAllNotificationsRead marks all notifications as read.
func (db *DB) MarkAllNotificationsRead() error {
	_, err := db.conn.Exec("UPDATE notifications SET read = 1 WHERE read = 0")
	if err != nil {
		return fmt.Errorf("mark all notifications read: %w", err)
	}
	return nil
}

// DeleteNotification removes a single notification.
func (db *DB) DeleteNotification(id int64) error {
	_, err := db.conn.Exec("DELETE FROM notifications WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete notification: %w", err)
	}
	return nil
}

// ClearAllNotifications removes all notifications.
func (db *DB) ClearAllNotifications() error {
	_, err := db.conn.Exec("DELETE FROM notifications")
	if err != nil {
		return fmt.Errorf("clear notifications: %w", err)
	}
	return nil
}

// PruneOldNotifications deletes notifications older than the given cutoff.
func (db *DB) PruneOldNotifications(before time.Time) (int64, error) {
	res, err := db.conn.Exec("DELETE FROM notifications WHERE created_at < ?", before)
	if err != nil {
		return 0, fmt.Errorf("prune old notifications: %w", err)
	}
	return res.RowsAffected()
}
