package services

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	gh "review-deck/internal/github"
	"review-deck/internal/storage"

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

// reviewSince returns the cutoff time for review-related queries based on the
// review_max_age_days setting (default 7, range 1-90).
func (s *PullRequestService) reviewSince() time.Time {
	val, err := s.db.GetSetting("review_max_age_days")
	if err != nil || val == "" {
		return time.Now().AddDate(0, 0, -7)
	}
	days, err := strconv.Atoi(val)
	if err != nil || days < 1 {
		return time.Now().AddDate(0, 0, -7)
	}
	if days > 90 {
		days = 90
	}
	return time.Now().AddDate(0, 0, -days)
}

// getExcludedRepos returns excluded repos for an org formatted as "org/repo" for query exclusion.
func (s *PullRequestService) getExcludedRepos(org string) []string {
	repos, err := s.db.GetExcludedRepos(org)
	if err != nil {
		return nil
	}
	qualified := make([]string, len(repos))
	for i, r := range repos {
		qualified[i] = fmt.Sprintf("%s/%s", org, r)
	}
	return qualified
}

// ---- Paginated methods (used by the frontend) ----

// GetMyPRsPage returns a single page of open PRs authored by the current user.
func (s *PullRequestService) GetMyPRsPage(org string, pageSize int, cursor string) (*gh.PRPage, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	page, err := s.client.GetMyOpenPRsPage(context.Background(), org, login, pageSize, cursor, s.filterBotsEnabled(), s.getExcludedRepos(org))
	if err != nil {
		return nil, fmt.Errorf("fetch my PRs: %w", err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// GetMyRecentMergedPage returns a single page of recently merged PRs by the current user.
func (s *PullRequestService) GetMyRecentMergedPage(org string, daysBack int, pageSize int, cursor string) (*gh.PRPage, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	since := time.Now().AddDate(0, 0, -daysBack)
	page, err := s.client.GetMyRecentMergedPRsPage(context.Background(), org, login, since, pageSize, cursor, s.filterBotsEnabled(), s.getExcludedRepos(org))
	if err != nil {
		return nil, fmt.Errorf("fetch merged PRs: %w", err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// GetReviewRequestsPage returns a single page of PRs awaiting the current user's review.
func (s *PullRequestService) GetReviewRequestsPage(org string, pageSize int, cursor string) (*gh.PRPage, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	page, err := s.client.GetReviewRequestsPage(context.Background(), org, login, s.reviewSince(), pageSize, cursor, s.filterBotsEnabled(), s.getExcludedRepos(org))
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
	page, err := s.client.GetTeamReviewRequestsPage(context.Background(), org, team, s.reviewSince(), pageSize, cursor, s.filterBotsEnabled(), s.getExcludedRepos(org))
	if err != nil {
		return nil, fmt.Errorf("fetch team review requests: %w", err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// GetReviewedByMePage returns a single page of open PRs reviewed by the current user.
func (s *PullRequestService) GetReviewedByMePage(org string, pageSize int, cursor string) (*gh.PRPage, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	page, err := s.client.GetReviewedByUserPage(context.Background(), org, login, s.reviewSince(), pageSize, cursor, s.filterBotsEnabled(), s.getExcludedRepos(org))
	if err != nil {
		return nil, fmt.Errorf("fetch reviewed PRs: %w", err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// ---- Repo-scoped paginated methods (used by the new repo-focused frontend) ----

// GetMyPRsForRepoPage returns a single page of open PRs for a specific repo.
func (s *PullRequestService) GetMyPRsForRepoPage(owner, repo string, pageSize int, cursor string) (*gh.PRPage, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	page, err := s.client.GetMyOpenPRsForRepoPage(context.Background(), owner, repo, login, pageSize, cursor, s.filterBotsEnabled())
	if err != nil {
		return nil, fmt.Errorf("fetch my PRs for %s/%s: %w", owner, repo, err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// GetMyRecentMergedForRepoPage returns a single page of recently merged PRs for a specific repo.
func (s *PullRequestService) GetMyRecentMergedForRepoPage(owner, repo string, daysBack int, pageSize int, cursor string) (*gh.PRPage, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	since := time.Now().AddDate(0, 0, -daysBack)
	page, err := s.client.GetMyRecentMergedPRsForRepoPage(context.Background(), owner, repo, login, since, pageSize, cursor, s.filterBotsEnabled())
	if err != nil {
		return nil, fmt.Errorf("fetch merged PRs for %s/%s: %w", owner, repo, err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// GetReviewRequestsForRepoPage returns a single page of review requests for a specific repo.
func (s *PullRequestService) GetReviewRequestsForRepoPage(owner, repo string, pageSize int, cursor string) (*gh.PRPage, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	page, err := s.client.GetReviewRequestsForRepoPage(context.Background(), owner, repo, login, s.reviewSince(), pageSize, cursor, s.filterBotsEnabled())
	if err != nil {
		return nil, fmt.Errorf("fetch review requests for %s/%s: %w", owner, repo, err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// GetReviewedByMeForRepoPage returns a single page of PRs reviewed by the user for a specific repo.
func (s *PullRequestService) GetReviewedByMeForRepoPage(owner, repo string, pageSize int, cursor string) (*gh.PRPage, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	page, err := s.client.GetReviewedByUserForRepoPage(context.Background(), owner, repo, login, s.reviewSince(), pageSize, cursor, s.filterBotsEnabled())
	if err != nil {
		return nil, fmt.Errorf("fetch reviewed PRs for %s/%s: %w", owner, repo, err)
	}
	_ = s.db.UpsertPullRequests(page.PullRequests)
	return page, nil
}

// ---- Legacy fetch-all methods (kept for poller compatibility) ----

// GetMyPRs fetches ALL open PRs authored by the current user (used by poller).
func (s *PullRequestService) GetMyPRs(org string) ([]gh.PullRequest, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	prs, err := s.client.GetMyOpenPRs(context.Background(), org, login, s.filterBotsEnabled(), s.getExcludedRepos(org))
	if err != nil {
		return nil, fmt.Errorf("fetch my PRs: %w", err)
	}
	_ = s.db.UpsertPullRequests(prs)
	return prs, nil
}

// GetMyRecentMerged returns ALL recently merged PRs (used by poller).
func (s *PullRequestService) GetMyRecentMerged(org string, daysBack int) ([]gh.PullRequest, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	since := time.Now().AddDate(0, 0, -daysBack)
	prs, err := s.client.GetMyRecentMergedPRs(context.Background(), org, login, since, s.filterBotsEnabled(), s.getExcludedRepos(org))
	if err != nil {
		return nil, fmt.Errorf("fetch merged PRs: %w", err)
	}
	_ = s.db.UpsertPullRequests(prs)
	return prs, nil
}

// GetReviewRequests returns ALL pending review requests (used by poller).
func (s *PullRequestService) GetReviewRequests(org string) ([]gh.PullRequest, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	prs, err := s.client.GetReviewRequestsForUser(context.Background(), org, login, s.reviewSince(), s.filterBotsEnabled(), s.getExcludedRepos(org))
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
	prs, err := s.client.GetTeamReviewRequests(context.Background(), org, team, s.reviewSince(), s.filterBotsEnabled(), s.getExcludedRepos(org))
	if err != nil {
		return nil, fmt.Errorf("fetch team review requests: %w", err)
	}
	_ = s.db.UpsertPullRequests(prs)
	return prs, nil
}

// GetReviewedByMe returns ALL open PRs reviewed by the current user (used by poller).
func (s *PullRequestService) GetReviewedByMe(org string) ([]gh.PullRequest, error) {
	login, err := s.getViewerLogin()
	if err != nil {
		return nil, err
	}
	prs, err := s.client.GetReviewedByUser(context.Background(), org, login, s.reviewSince(), s.filterBotsEnabled(), s.getExcludedRepos(org))
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
// Returns "merged" on direct merge success, or "enqueued" if the repository
// requires a merge queue and the PR was added to it.
func (s *PullRequestService) MergePR(prNodeID string, method string) (string, error) {
	if s.client == nil {
		return "", fmt.Errorf("not authenticated")
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

	ctx := context.Background()
	err := s.client.MergePR(ctx, prNodeID, mergeMethod)
	if err == nil {
		return "merged", nil
	}

	// If direct merge failed due to merge queue requirement, try enqueue.
	errMsg := strings.ToLower(err.Error())
	if strings.Contains(errMsg, "merge queue") || strings.Contains(errMsg, "required to use the merge queue") || strings.Contains(errMsg, "is in a merge queue") {
		if enqErr := s.client.EnqueuePR(ctx, prNodeID); enqErr != nil {
			return "", fmt.Errorf("merge failed (%v) and enqueue also failed: %w", err, enqErr)
		}
		return "enqueued", nil
	}

	return "", err
}

// ApprovePR submits an approving review on a pull request.
// An optional body can be provided as a comment with the approval.
func (s *PullRequestService) ApprovePR(prNodeID string, body string) error {
	if s.client == nil {
		return fmt.Errorf("not authenticated")
	}
	return s.client.ApprovePR(context.Background(), prNodeID, body)
}

// RequestChangesPR submits a "request changes" review on a pull request.
func (s *PullRequestService) RequestChangesPR(prNodeID string, body string) error {
	if s.client == nil {
		return fmt.Errorf("not authenticated")
	}
	if body == "" {
		return fmt.Errorf("a review body is required when requesting changes")
	}
	return s.client.RequestChangesPR(context.Background(), prNodeID, body)
}

// ResolveThread resolves a review thread.
func (s *PullRequestService) ResolveThread(threadID string) error {
	if s.client == nil {
		return fmt.Errorf("not authenticated")
	}
	return s.client.ResolveThread(context.Background(), threadID)
}

// UnresolveThread unresolves a review thread.
func (s *PullRequestService) UnresolveThread(threadID string) error {
	if s.client == nil {
		return fmt.Errorf("not authenticated")
	}
	return s.client.UnresolveThread(context.Background(), threadID)
}

// RequestReviews adds reviewers to a pull request.
// userIDs and teamIDs are GitHub GraphQL node IDs.
func (s *PullRequestService) RequestReviews(prNodeID string, userIDs []string, teamIDs []string) error {
	if s.client == nil {
		return fmt.Errorf("not authenticated")
	}

	return s.client.RequestReviews(context.Background(), prNodeID, userIDs, teamIDs)
}

// GetRepoLabels fetches all labels for a repository from GitHub and persists
// them to the local DB cache for offline/startup access.
func (s *PullRequestService) GetRepoLabels(owner string, repo string) ([]gh.Label, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	labels, err := s.client.GetRepoLabels(context.Background(), owner, repo)
	if err != nil {
		return nil, err
	}
	// Persist to DB so they survive restarts.
	if dbErr := s.db.UpsertRepoLabels(owner, repo, labels); dbErr != nil {
		// Non-fatal — log but still return the labels.
		fmt.Printf("warning: failed to cache labels for %s/%s: %v\n", owner, repo, dbErr)
	}
	return labels, nil
}

// AddLabels adds labels to a pull request by its node ID.
func (s *PullRequestService) AddLabels(prNodeID string, labelIDs []string) error {
	if s.client == nil {
		return fmt.Errorf("not authenticated")
	}
	return s.client.AddLabels(context.Background(), prNodeID, labelIDs)
}

// RemoveLabels removes labels from a pull request by its node ID.
func (s *PullRequestService) RemoveLabels(prNodeID string, labelIDs []string) error {
	if s.client == nil {
		return fmt.Errorf("not authenticated")
	}
	return s.client.RemoveLabels(context.Background(), prNodeID, labelIDs)
}

// GetOrgMembers returns all cached members for an org.
// Returns an empty list (not an error) if no members are cached.
func (s *PullRequestService) GetOrgMembers(org string) ([]gh.User, error) {
	return s.db.GetOrgMembers(org)
}

// SearchOrgMembers returns org members matching a search query.
// Searches the local DB cache first; falls back to the GitHub API if the cache is empty.
func (s *PullRequestService) SearchOrgMembers(org string, query string) ([]gh.User, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}

	// Check if we have cached members for this org.
	count, _ := s.db.GetOrgMemberCount(org)
	if count > 0 {
		return s.db.SearchOrgMembers(org, query)
	}

	// No cache yet — trigger a background sync and fall back to API search.
	go func() { _ = s.SyncOrgMembers(org) }()
	return s.client.SearchOrgMembers(context.Background(), org, query)
}

// SyncOrgMembers fetches all members of an organization from GitHub and
// stores them in the local database cache.
func (s *PullRequestService) SyncOrgMembers(org string) error {
	if s.client == nil {
		return fmt.Errorf("not authenticated")
	}

	members, err := s.client.ListOrgMembers(context.Background(), org)
	if err != nil {
		return fmt.Errorf("list org members for %s: %w", org, err)
	}

	return s.db.UpsertOrgMembers(org, members)
}

// SyncOrgMembersIfStale syncs org members only if the cache is older than maxAge.
func (s *PullRequestService) SyncOrgMembersIfStale(org string, maxAge time.Duration) error {
	syncedAt, err := s.db.GetOrgMembersSyncedAt(org)
	if err != nil {
		return err
	}

	if !syncedAt.IsZero() && time.Since(syncedAt) < maxAge {
		return nil // cache is fresh
	}

	return s.SyncOrgMembers(org)
}

// SyncTeamsForOrg fetches the viewer's teams from GitHub and upserts them
// into the tracked_teams table. New teams are enabled by default; existing
// teams keep their current enabled state.
func (s *PullRequestService) SyncTeamsForOrg(org string) error {
	if s.client == nil {
		return fmt.Errorf("not authenticated")
	}

	teams, err := s.client.GetViewerTeams(context.Background(), org)
	if err != nil {
		return fmt.Errorf("get teams for %s: %w", org, err)
	}

	return s.db.UpsertTrackedTeams(org, teams)
}

// ---- On-demand PR detail queries ----

// GetSinglePR fetches a single pull request by owner, repo name, and number.
func (s *PullRequestService) GetSinglePR(owner, repoName string, number int) (*gh.PullRequest, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	pr, err := s.client.GetSinglePR(context.Background(), owner, repoName, number)
	if err != nil {
		return nil, fmt.Errorf("fetch single PR: %w", err)
	}
	return pr, nil
}

// GetPRCheckRuns fetches individual CI check runs for a specific PR.
func (s *PullRequestService) GetPRCheckRuns(nodeID string) ([]gh.CheckRun, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	runs, err := s.client.GetPRCheckRuns(context.Background(), nodeID)
	if err != nil {
		return nil, fmt.Errorf("fetch check runs: %w", err)
	}
	return runs, nil
}

// GetPRComments fetches all comments and review threads for a specific PR.
func (s *PullRequestService) GetPRComments(nodeID string) (*gh.PRComments, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	comments, err := s.client.GetPRComments(context.Background(), nodeID)
	if err != nil {
		return nil, fmt.Errorf("fetch pr comments: %w", err)
	}
	return comments, nil
}

// GetPRFiles fetches the list of changed files with diff patches for a PR.
func (s *PullRequestService) GetPRFiles(owner, repo string, number int) ([]gh.PRFile, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	files, err := s.client.GetPRFiles(context.Background(), owner, repo, number)
	if err != nil {
		return nil, fmt.Errorf("fetch PR files: %w", err)
	}
	return files, nil
}

// GetPRCommits fetches all commits for a specific PR.
func (s *PullRequestService) GetPRCommits(nodeID string) ([]gh.PRCommit, error) {
	if s.client == nil {
		return nil, fmt.Errorf("not authenticated")
	}
	commits, err := s.client.GetPRCommits(context.Background(), nodeID)
	if err != nil {
		return nil, fmt.Errorf("fetch pr commits: %w", err)
	}
	return commits, nil
}

// ---- Metrics ----

// GetMetricsHistory returns historical metrics snapshots for the given number of days back.
func (s *PullRequestService) GetMetricsHistory(daysBack int) ([]storage.MetricsSnapshot, error) {
	since := time.Now().AddDate(0, 0, -daysBack)
	return s.db.GetMetricsSnapshots(since)
}
