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
	db          *storage.DB
	client      *gh.Client
	viewerLogin string // cached after first successful GetViewer call
}

// NewPullRequestService creates a new PullRequestService.
func NewPullRequestService(db *storage.DB) *PullRequestService {
	return &PullRequestService{db: db}
}

// SetClient sets the GitHub client and clears the cached viewer.
func (s *PullRequestService) SetClient(client *gh.Client) {
	s.client = client
	s.viewerLogin = "" // clear cache on client change (login/logout)
}

// getViewerLogin returns the cached viewer login, fetching once if needed.
func (s *PullRequestService) getViewerLogin() (string, error) {
	if s.viewerLogin != "" {
		return s.viewerLogin, nil
	}
	if s.client == nil {
		return "", fmt.Errorf("not authenticated")
	}
	viewer, err := s.client.GetViewer(context.Background())
	if err != nil {
		return "", fmt.Errorf("get viewer: %w", err)
	}
	s.viewerLogin = viewer.Login
	return s.viewerLogin, nil
}

// filterBotsEnabled reads the filter_bots setting from the database.
func (s *PullRequestService) filterBotsEnabled() bool {
	val, err := s.db.GetSetting("filter_bots")
	if err != nil {
		return false
	}
	return val == "true"
}

// ---- Paginated methods (used by the frontend) ----

// GetMyPRsPage returns a single page of open PRs authored by the current user.
func (s *PullRequestService) GetMyPRsPage(org string, pageSize int, cursor string) (*gh.PRPage, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	viewer, err := s.client.GetViewer(context.Background())
	if err != nil {
		return nil, fmt.Errorf("get viewer: %w", err)
	}
	page, err := s.client.GetMyOpenPRsPage(context.Background(), org, viewer.Login, pageSize, cursor, s.filterBotsEnabled())
	if err != nil {
		return nil, fmt.Errorf("fetch my PRs: %w", err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// GetMyRecentMergedPage returns a single page of recently merged PRs by the current user.
func (s *PullRequestService) GetMyRecentMergedPage(org string, daysBack int, pageSize int, cursor string) (*gh.PRPage, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	viewer, err := s.client.GetViewer(context.Background())
	if err != nil {
		return nil, err
	}
	since := time.Now().AddDate(0, 0, -daysBack)
	page, err := s.client.GetMyRecentMergedPRsPage(context.Background(), org, viewer.Login, since, pageSize, cursor, s.filterBotsEnabled())
	if err != nil {
		return nil, fmt.Errorf("fetch merged PRs: %w", err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// GetReviewRequestsPage returns a single page of PRs awaiting the current user's review.
func (s *PullRequestService) GetReviewRequestsPage(org string, pageSize int, cursor string) (*gh.PRPage, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	viewer, err := s.client.GetViewer(context.Background())
	if err != nil {
		return nil, err
	}
	page, err := s.client.GetReviewRequestsPage(context.Background(), org, viewer.Login, pageSize, cursor, s.filterBotsEnabled())
	if err != nil {
		return nil, fmt.Errorf("fetch review requests: %w", err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// GetTeamReviewRequestsPage returns a single page of team review requests.
func (s *PullRequestService) GetTeamReviewRequestsPage(org, team string, pageSize int, cursor string) (*gh.PRPage, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	page, err := s.client.GetTeamReviewRequestsPage(context.Background(), org, team, pageSize, cursor, s.filterBotsEnabled())
	if err != nil {
		return nil, fmt.Errorf("fetch team review requests: %w", err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// GetReviewedByMePage returns a single page of open PRs reviewed by the current user.
func (s *PullRequestService) GetReviewedByMePage(org string, pageSize int, cursor string) (*gh.PRPage, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	viewer, err := s.client.GetViewer(context.Background())
	if err != nil {
		return nil, err
	}
	page, err := s.client.GetReviewedByUserPage(context.Background(), org, viewer.Login, pageSize, cursor, s.filterBotsEnabled())
	if err != nil {
		return nil, fmt.Errorf("fetch reviewed PRs: %w", err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// ---- Legacy fetch-all methods (kept for poller compatibility) ----

// GetMyPRs fetches ALL open PRs authored by the current user (used by poller).
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
	_ = s.db.UpsertPullRequests(prs)
	return prs, nil
}

// GetMyRecentMerged returns ALL recently merged PRs (used by poller).
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
	_ = s.db.UpsertPullRequests(prs)
	return prs, nil
}

// GetReviewRequests returns ALL pending review requests (used by poller).
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
	_ = s.db.UpsertPullRequests(prs)
	return prs, nil
}

// GetTeamReviewRequests returns ALL team review requests (used by poller).
func (s *PullRequestService) GetTeamReviewRequests(org, team string) ([]gh.PullRequest, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	prs, err := s.client.GetTeamReviewRequests(context.Background(), org, team)
	if err != nil {
		return nil, fmt.Errorf("fetch team review requests: %w", err)
	}
	_ = s.db.UpsertPullRequests(prs)
	return prs, nil
}

// GetReviewedByMe returns ALL open PRs reviewed by the current user (used by poller).
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
	_ = s.db.UpsertPullRequests(prs)
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

// SearchOrgMembers returns org members matching a search query.
func (s *PullRequestService) SearchOrgMembers(org string, query string) ([]gh.User, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	return s.client.SearchOrgMembers(context.Background(), org, query)
}
