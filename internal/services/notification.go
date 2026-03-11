package services

import (
	"review-deck/internal/storage"
)

// NotificationService manages notification history for the inbox.
type NotificationService struct {
	db *storage.DB
}

// NewNotificationService creates a new NotificationService.
func NewNotificationService(db *storage.DB) *NotificationService {
	return &NotificationService{db: db}
}

// GetNotifications returns stored notifications, newest first.
// Limit controls max results; 0 returns all.
func (s *NotificationService) GetNotifications(limit int) ([]storage.AppNotification, error) {
	return s.db.GetNotifications(limit)
}

// GetUnreadCount returns the number of unread notifications.
func (s *NotificationService) GetUnreadCount() (int, error) {
	return s.db.GetUnreadCount()
}

// MarkRead marks a single notification as read.
func (s *NotificationService) MarkRead(id int64) error {
	return s.db.MarkNotificationRead(id)
}

// MarkAllRead marks all notifications as read.
func (s *NotificationService) MarkAllRead() error {
	return s.db.MarkAllNotificationsRead()
}

// Delete removes a single notification.
func (s *NotificationService) Delete(id int64) error {
	return s.db.DeleteNotification(id)
}

// ClearAll removes all notifications.
func (s *NotificationService) ClearAll() error {
	return s.db.ClearAllNotifications()
}
