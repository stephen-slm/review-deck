package services

import (
	"context"
	"fmt"
	"time"

	gh "pull-request-reviewing/internal/github"
	"pull-request-reviewing/internal/storage"

	"github.com/shurcooL/githubv4"
)

// PullRequestService provides PR data to the frontend.
type PullRequestService struct {
	db     *storage.DB
	client *gh.Client
}

// NewPullRequestService creates a new PullRequestService.
func NewPullRequestService(db *storage.DB) *PullRequestService {
	return &PullRequestService{db: db}
}

// SetClient sets the GitHub client.
func (s *PullRequestService) SetClient(client *gh.Client) {
	s.client = client
}

// GetMyPRs fetches open PRs authored by the current user from GitHub and caches them.
func (s *PullRequestService) GetMyPRs(org string) ([]gh.PullRequest, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	viewer, err := s.client.GetViewer(context.Background())
	if err != nil {
		return nil, fmt.Errorf("get viewer: %w", err)
	}

	prs, err := s.client.GetMyOpenPRs(context.Background(), org, viewer.Login)
	if err != nil {
		return nil, fmt.Errorf("fetch my PRs: %w", err)
	}

	if err := s.db.UpsertPullRequests(prs); err != nil {
		return nil, fmt.Errorf("cache PRs: %w", err)
	}

	return prs, nil
}

// GetMyRecentMerged returns recently merged PRs by the current user.
func (s *PullRequestService) GetMyRecentMerged(org string, daysBack int) ([]gh.PullRequest, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	viewer, err := s.client.GetViewer(context.Background())
	if err != nil {
		return nil, err
	}

	since := time.Now().AddDate(0, 0, -daysBack)
	prs, err := s.client.GetMyRecentMergedPRs(context.Background(), org, viewer.Login, since)
	if err != nil {
		return nil, fmt.Errorf("fetch merged PRs: %w", err)
	}

	if err := s.db.UpsertPullRequests(prs); err != nil {
		return nil, fmt.Errorf("cache PRs: %w", err)
	}

	return prs, nil
}

// GetReviewRequests returns PRs where the current user has pending review requests.
func (s *PullRequestService) GetReviewRequests(org string) ([]gh.PullRequest, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	viewer, err := s.client.GetViewer(context.Background())
	if err != nil {
		return nil, err
	}

	prs, err := s.client.GetReviewRequestsForUser(context.Background(), org, viewer.Login)
	if err != nil {
		return nil, fmt.Errorf("fetch review requests: %w", err)
	}

	if err := s.db.UpsertPullRequests(prs); err != nil {
		return nil, fmt.Errorf("cache PRs: %w", err)
	}

	return prs, nil
}

// GetTeamReviewRequests returns PRs where the given team has pending review requests.
func (s *PullRequestService) GetTeamReviewRequests(org, team string) ([]gh.PullRequest, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	prs, err := s.client.GetTeamReviewRequests(context.Background(), org, team)
	if err != nil {
		return nil, fmt.Errorf("fetch team review requests: %w", err)
	}

	if err := s.db.UpsertPullRequests(prs); err != nil {
		return nil, fmt.Errorf("cache PRs: %w", err)
	}

	return prs, nil
}

// GetReviewedByMe returns open PRs that the current user has reviewed.
func (s *PullRequestService) GetReviewedByMe(org string) ([]gh.PullRequest, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	viewer, err := s.client.GetViewer(context.Background())
	if err != nil {
		return nil, err
	}

	prs, err := s.client.GetReviewedByUser(context.Background(), org, viewer.Login)
	if err != nil {
		return nil, fmt.Errorf("fetch reviewed PRs: %w", err)
	}

	if err := s.db.UpsertPullRequests(prs); err != nil {
		return nil, fmt.Errorf("cache PRs: %w", err)
	}

	return prs, nil
}

// GetCachedPRs returns PRs from local cache without hitting GitHub API.
func (s *PullRequestService) GetCachedPRs(authorLogin string, state string) ([]gh.PullRequest, error) {
	return s.db.GetPullRequests(authorLogin, state)
}

// MergePR merges a pull request by its node ID.
// method must be one of: "MERGE", "SQUASH", "REBASE".
func (s *PullRequestService) MergePR(prNodeID string, method string) error {
	if s.client == nil {
		return fmt.Errorf("not authenticated")
	}

	var mergeMethod githubv4.PullRequestMergeMethod
	switch method {
	case "SQUASH":
		mergeMethod = githubv4.PullRequestMergeMethodSquash
	case "REBASE":
		mergeMethod = githubv4.PullRequestMergeMethodRebase
	default:
		mergeMethod = githubv4.PullRequestMergeMethodMerge
	}

	return s.client.MergePR(context.Background(), prNodeID, mergeMethod)
}

// RequestReviews adds reviewers to a pull request.
// userIDs and teamIDs are GitHub GraphQL node IDs.
func (s *PullRequestService) RequestReviews(prNodeID string, userIDs []string, teamIDs []string) error {
	if s.client == nil {
		return fmt.Errorf("not authenticated")
	}

	return s.client.RequestReviews(context.Background(), prNodeID, userIDs, teamIDs)
}
