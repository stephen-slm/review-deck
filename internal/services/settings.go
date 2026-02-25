package services

import (
	"pull-request-reviewing/internal/storage"
)

// SettingsService manages application settings.
type SettingsService struct {
	db *storage.DB
}

// NewSettingsService creates a new SettingsService.
func NewSettingsService(db *storage.DB) *SettingsService {
	return &SettingsService{db: db}
}

// GetSetting retrieves a setting value by key.
func (s *SettingsService) GetSetting(key string) (string, error) {
	return s.db.GetSetting(key)
}

// SetSetting stores a setting value.
func (s *SettingsService) SetSetting(key, value string) error {
	return s.db.SetSetting(key, value)
}

// GetTrackedOrgs returns all enabled tracked organizations.
func (s *SettingsService) GetTrackedOrgs() ([]string, error) {
	return s.db.GetTrackedOrgs()
}

// AddTrackedOrg adds an organization to track.
func (s *SettingsService) AddTrackedOrg(org string) error {
	return s.db.AddTrackedOrg(org)
}

// RemoveTrackedOrg disables tracking for an organization.
func (s *SettingsService) RemoveTrackedOrg(org string) error {
	return s.db.RemoveTrackedOrg(org)
}
