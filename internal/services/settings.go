package services

import (
	"review-deck/internal/storage"
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

// GetTrackedTeams returns all tracked teams for an org (enabled and disabled).
func (s *SettingsService) GetTrackedTeams(org string) ([]storage.TrackedTeam, error) {
	return s.db.GetTrackedTeams(org)
}

// SetTeamEnabled enables or disables a tracked team.
func (s *SettingsService) SetTeamEnabled(org, slug string, enabled bool) error {
	return s.db.SetTeamEnabled(org, slug, enabled)
}

// GetReviewPriorities returns all review priority entries for an org.
func (s *SettingsService) GetReviewPriorities(org string) ([]storage.ReviewPriority, error) {
	return s.db.GetReviewPriorities(org)
}

// AddReviewPriority adds a user or team to the priority list.
func (s *SettingsService) AddReviewPriority(org, name, typeName string) error {
	return s.db.AddReviewPriority(org, name, typeName)
}

// RemoveReviewPriority removes a user or team from the priority list.
func (s *SettingsService) RemoveReviewPriority(org, name, typeName string) error {
	return s.db.RemoveReviewPriority(org, name, typeName)
}

// UpdateReviewPriorityOrder updates the priority value for a priority entry.
func (s *SettingsService) UpdateReviewPriorityOrder(org, name, typeName string, priority int) error {
	return s.db.UpdateReviewPriorityOrder(org, name, typeName, priority)
}

// GetExcludedRepos returns all excluded repository names for an org.
func (s *SettingsService) GetExcludedRepos(org string) ([]string, error) {
	return s.db.GetExcludedRepos(org)
}

// AddExcludedRepo adds a repository to the exclusion list for an org.
func (s *SettingsService) AddExcludedRepo(org, repo string) error {
	return s.db.AddExcludedRepo(org, repo)
}

// RemoveExcludedRepo removes a repository from the exclusion list.
func (s *SettingsService) RemoveExcludedRepo(org, repo string) error {
	return s.db.RemoveExcludedRepo(org, repo)
}
