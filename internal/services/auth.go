package services

import (
	"context"
	"fmt"

	gh "pull-request-reviewing/internal/github"
	"pull-request-reviewing/internal/storage"
)

// ClientConsumer is any service that needs a GitHub client.
type ClientConsumer interface {
	SetClient(client *gh.Client)
}

// AuthService handles authentication with GitHub.
type AuthService struct {
	db        *storage.DB
	client    *gh.Client
	consumers []ClientConsumer
}

// NewAuthService creates a new AuthService.
func NewAuthService(db *storage.DB) *AuthService {
	return &AuthService{db: db}
}

// RegisterConsumer registers a service that should receive client updates
// on login/logout.
func (s *AuthService) RegisterConsumer(c ClientConsumer) {
	s.consumers = append(s.consumers, c)
}

// SetClient sets the GitHub client after authentication.
func (s *AuthService) SetClient(client *gh.Client) {
	s.client = client
	for _, c := range s.consumers {
		c.SetClient(client)
	}
}

// Login validates a PAT and stores it if valid. Returns the viewer info.
func (s *AuthService) Login(token string) (*gh.ViewerInfo, error) {
	client, err := gh.NewClient(token)
	if err != nil {
		return nil, fmt.Errorf("create github client: %w", err)
	}

	viewer, err := client.GetViewer(context.Background())
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	if err := s.db.SetSetting("github_token", token); err != nil {
		return nil, fmt.Errorf("store token: %w", err)
	}
	if err := s.db.SetSetting("viewer_login", viewer.Login); err != nil {
		return nil, err
	}
	if err := s.db.SetSetting("viewer_name", viewer.Name); err != nil {
		return nil, err
	}
	if err := s.db.SetSetting("viewer_avatar", viewer.AvatarURL); err != nil {
		return nil, err
	}

	// Propagate client to self and all registered consumers.
	s.SetClient(client)

	return viewer, nil
}

// Logout removes the stored token and clears all clients.
func (s *AuthService) Logout() error {
	s.client = nil
	for _, c := range s.consumers {
		c.SetClient(nil)
	}

	s.db.DeleteSetting("github_token")
	s.db.DeleteSetting("viewer_login")
	s.db.DeleteSetting("viewer_name")
	s.db.DeleteSetting("viewer_avatar")
	return nil
}

// IsAuthenticated checks if we have a valid stored token.
func (s *AuthService) IsAuthenticated() bool {
	return s.client != nil
}

// GetUser returns the cached viewer info from the database.
func (s *AuthService) GetUser() (*gh.ViewerInfo, error) {
	login, err := s.db.GetSetting("viewer_login")
	if err != nil {
		return nil, fmt.Errorf("not authenticated")
	}

	name, _ := s.db.GetSetting("viewer_name")
	avatar, _ := s.db.GetSetting("viewer_avatar")

	return &gh.ViewerInfo{
		Login:     login,
		Name:      name,
		AvatarURL: avatar,
	}, nil
}

// GetClient returns the current GitHub client.
func (s *AuthService) GetClient() *gh.Client {
	return s.client
}
