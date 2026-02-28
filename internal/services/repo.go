package services

import (
	"context"
	"fmt"

	gh "review-deck/internal/github"
	"review-deck/internal/gitutil"
	"review-deck/internal/storage"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// RepoService manages tracked local repositories. It is bound to Wails
// and provides folder-picker, git-remote parsing, and CRUD for repos.
type RepoService struct {
	db     *storage.DB
	client *gh.Client
	ctx    context.Context // Wails app context, set via SetContext
}

// NewRepoService creates a new RepoService.
func NewRepoService(db *storage.DB) *RepoService {
	return &RepoService{db: db}
}

// SetClient updates the GitHub client.
func (s *RepoService) SetClient(client *gh.Client) {
	s.client = client
}

// SetContext sets the Wails app context (needed for native dialogs).
func (s *RepoService) SetContext(ctx context.Context) {
	s.ctx = ctx
}

// SelectFolder opens a native OS directory picker and returns the selected path.
// Returns an empty string if the user cancels.
func (s *RepoService) SelectFolder() (string, error) {
	if s.ctx == nil {
		return "", fmt.Errorf("app context not set")
	}
	path, err := wailsRuntime.OpenDirectoryDialog(s.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select a Git Repository",
	})
	if err != nil {
		return "", fmt.Errorf("open directory dialog: %w", err)
	}
	return path, nil
}

// ValidateGitRepo checks that the given path is a git repo with a GitHub
// remote and returns the parsed owner/repo info.
func (s *RepoService) ValidateGitRepo(path string) (*gitutil.RepoInfo, error) {
	if path == "" {
		return nil, fmt.Errorf("path is empty")
	}

	if !gitutil.IsGitRepo(path) {
		return nil, fmt.Errorf("not a git repository: %s", path)
	}

	info, err := gitutil.GetRemoteInfo(path)
	if err != nil {
		return nil, fmt.Errorf("parse remote: %w", err)
	}

	return info, nil
}

// AddRepoFromPath validates a git repo path, verifies the GitHub repo is
// accessible, and adds it to the tracked repos database.
func (s *RepoService) AddRepoFromPath(path string) (*storage.TrackedRepo, error) {
	info, err := s.ValidateGitRepo(path)
	if err != nil {
		return nil, err
	}

	// Validate that the GitHub repo exists and is accessible.
	if s.client != nil {
		if err := s.client.RepoExists(context.Background(), info.Owner, info.Repo); err != nil {
			return nil, fmt.Errorf("cannot access %s/%s on GitHub: %w", info.Owner, info.Repo, err)
		}
	}

	repo, err := s.db.InsertTrackedRepo(path, info.Owner, info.Repo, info.RemoteURL)
	if err != nil {
		return nil, err
	}

	return repo, nil
}

// AddRepo opens a folder picker, then validates and adds the selected repo.
// This is the primary method called from the frontend.
func (s *RepoService) AddRepo() (*storage.TrackedRepo, error) {
	path, err := s.SelectFolder()
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, nil // user cancelled
	}

	return s.AddRepoFromPath(path)
}

// RemoveRepo soft-deletes a tracked repository by ID.
func (s *RepoService) RemoveRepo(id int) error {
	return s.db.DisableTrackedRepo(id)
}

// GetTrackedRepos returns all enabled tracked repositories.
func (s *RepoService) GetTrackedRepos() ([]storage.TrackedRepo, error) {
	return s.db.GetTrackedRepos()
}

// GetTrackedRepoByID returns a single tracked repo.
func (s *RepoService) GetTrackedRepoByID(id int) (*storage.TrackedRepo, error) {
	return s.db.GetTrackedRepoByID(id)
}
