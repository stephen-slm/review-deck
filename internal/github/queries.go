package github

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/shurcooL/githubv4"
)

// truncateQuery shortens a query string for log display.
func truncateQuery(q string, max int) string {
	if len(q) <= max {
		return q
	}
	return q[:max] + "..."
}

// isTransientError returns true for HTTP 502/504 errors from GitHub that are
// worth retrying.
func isTransientError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "502") || strings.Contains(msg, "504")
}

// prFields contains the GraphQL field selections shared between the search
// query and the single-PR query.  Extracted into a named type so both query
// structs can embed it and reuse convertPRFields.
type prFields struct {
	ID     string `graphql:"id"`
	Number int
	Title  string
	URL    string `graphql:"url"`
	State  githubv4.PullRequestState
	Body   string

	IsDraft        bool
	IsInMergeQueue bool `graphql:"isInMergeQueue"`
	Mergeable      githubv4.MergeableState
	ReviewDecision githubv4.PullRequestReviewDecision

	Additions    int
	Deletions    int
	ChangedFiles int

	HeadRefName string
	HeadRefOid  string `graphql:"headRefOid"`
	BaseRefName string

	CreatedAt time.Time
	UpdatedAt time.Time
	MergedAt  *time.Time
	ClosedAt  *time.Time

	Author struct {
		Login     string
		AvatarURL string `graphql:"avatarUrl(size: 64)"`
	} `graphql:"author"`

	MergedBy *struct {
		Login string
	} `graphql:"mergedBy"`

	Repository struct {
		Name  string
		Owner struct {
			Login string
		}
	}

	Commits struct {
		TotalCount int
		Nodes      []struct {
			Commit struct {
				StatusCheckRollup *struct {
					State githubv4.StatusState
				}
			}
		}
	} `graphql:"commits(last: 1)"`

	Assignees struct {
		Nodes []struct {
			Login     string
			AvatarURL string `graphql:"avatarUrl(size: 32)"`
		}
	} `graphql:"assignees(first: 10)"`

	Labels struct {
		Nodes []struct {
			ID    string `graphql:"id"`
			Name  string
			Color string
		}
	} `graphql:"labels(first: 20)"`

	ReviewRequests struct {
		Nodes []struct {
			RequestedReviewer struct {
				UserFragment struct {
					Login string
				} `graphql:"... on User"`
				TeamFragment struct {
					Name string
					Slug string
				} `graphql:"... on Team"`
			}
		}
	} `graphql:"reviewRequests(first: 20)"`

	Reviews struct {
		Nodes []struct {
			ID     string `graphql:"id"`
			Author struct {
				Login     string
				AvatarURL string `graphql:"avatarUrl(size: 32)"`
			}
			State       githubv4.PullRequestReviewState
			Body        string
			SubmittedAt time.Time
			Commit      struct {
				Oid string
			}
		}
	} `graphql:"reviews(first: 10)"`
}

// prSearchNode matches the shape of a PullRequest inside a search result.
type prSearchNode struct {
	PullRequest prFields `graphql:"... on PullRequest"`
}

// searchQuery is the generic search query shape used for all PR searches.
type searchQuery struct {
	Search struct {
		IssueCount int
		PageInfo   struct {
			HasNextPage bool
			EndCursor   githubv4.String
		}
		Nodes []prSearchNode
	} `graphql:"search(query: $query, type: ISSUE, first: $first, after: $cursor)"`
}

// convertPRFields converts GraphQL PR fields to our domain PullRequest.
func convertPRFields(pr prFields) PullRequest {
	result := PullRequest{
		NodeID:         pr.ID,
		Number:         pr.Number,
		URL:            pr.URL,
		RepoOwner:      pr.Repository.Owner.Login,
		RepoName:       pr.Repository.Name,
		Title:          pr.Title,
		Body:           pr.Body,
		HeadRef:        pr.HeadRefName,
		HeadRefOid:     pr.HeadRefOid,
		BaseRef:        pr.BaseRefName,
		State:          string(pr.State),
		IsDraft:        pr.IsDraft,
		IsInMergeQueue: pr.IsInMergeQueue,
		Mergeable:      string(pr.Mergeable),
		ReviewDecision: string(pr.ReviewDecision),
		Author:         pr.Author.Login,
		AuthorAvatar:   pr.Author.AvatarURL,
		Additions:      pr.Additions,
		Deletions:      pr.Deletions,
		ChangedFiles:   pr.ChangedFiles,
		CommitCount:    pr.Commits.TotalCount,
		CreatedAt:      pr.CreatedAt,
		UpdatedAt:      pr.UpdatedAt,
		MergedAt:       pr.MergedAt,
		ClosedAt:       pr.ClosedAt,
	}

	if pr.MergedBy != nil {
		result.MergedBy = pr.MergedBy.Login
	}

	for _, a := range pr.Assignees.Nodes {
		result.Assignees = append(result.Assignees, User{Login: a.Login, AvatarURL: a.AvatarURL})
	}

	for _, l := range pr.Labels.Nodes {
		result.Labels = append(result.Labels, Label{ID: l.ID, Name: l.Name, Color: l.Color})
	}

	for _, rr := range pr.ReviewRequests.Nodes {
		req := ReviewRequest{}
		if rr.RequestedReviewer.UserFragment.Login != "" {
			req.Reviewer = rr.RequestedReviewer.UserFragment.Login
			req.ReviewerType = "user"
		} else if rr.RequestedReviewer.TeamFragment.Slug != "" {
			req.Reviewer = rr.RequestedReviewer.TeamFragment.Slug
			req.ReviewerType = "team"
		}
		if req.Reviewer != "" {
			result.ReviewRequests = append(result.ReviewRequests, req)
		}
	}

	for _, r := range pr.Reviews.Nodes {
		result.Reviews = append(result.Reviews, Review{
			ID:           r.ID,
			Author:       r.Author.Login,
			AuthorAvatar: r.Author.AvatarURL,
			State:        string(r.State),
			Body:         r.Body,
			SubmittedAt:  r.SubmittedAt,
			CommitOID:    r.Commit.Oid,
		})
	}

	// Extract CI status from the last commit's StatusCheckRollup.
	if len(pr.Commits.Nodes) > 0 {
		rollup := pr.Commits.Nodes[0].Commit.StatusCheckRollup
		if rollup != nil {
			result.ChecksStatus = string(rollup.State)
		}
	}

	return result
}

// searchAllPRs fetches ALL pages of a search (used by the background poller).
func (c *Client) searchAllPRs(ctx context.Context, queryStr string) ([]PullRequest, error) {
	start := time.Now()
	c.logf("gql:searchAll", "query=%q pageSize=10", truncateQuery(queryStr, 120))

	variables := map[string]any{
		"query":  githubv4.String(queryStr),
		"first":  githubv4.Int(10),
		"cursor": (*githubv4.String)(nil),
	}

	var allPRs []PullRequest
	pages := 0
	for {
		var q searchQuery
		var err error
		err = c.graphql.Query(ctx, &q, variables)
		if err != nil && isTransientError(err) {
			c.logf("gql:searchAll", "transient error, retrying in 3s: %v", err)
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(3 * time.Second):
			}
			err = c.graphql.Query(ctx, &q, variables)
		}
		if err != nil {
			c.logf("gql:searchAll", "ERROR after %d pages (%s): %v", pages, time.Since(start), err)
			return nil, fmt.Errorf("github graphql search: %w", err)
		}
		pages++

		for _, node := range q.Search.Nodes {
			allPRs = append(allPRs, convertPRFields(node.PullRequest))
		}

		if !q.Search.PageInfo.HasNextPage {
			break
		}
		variables["cursor"] = githubv4.NewString(q.Search.PageInfo.EndCursor)
	}

	c.logf("gql:searchAll", "OK %d PRs across %d pages in %s", len(allPRs), pages, time.Since(start))
	return allPRs, nil
}

// searchPRsPage fetches a single page of search results (used by frontend-facing services).
// cursor should be "" for the first page.
func (c *Client) searchPRsPage(ctx context.Context, queryStr string, pageSize int, cursor string) (*PRPage, error) {
	if pageSize <= 0 || pageSize > 10 {
		pageSize = 10
	}

	start := time.Now()
	cursorLabel := "(first)"
	if cursor != "" {
		cursorLabel = cursor
		if len(cursorLabel) > 12 {
			cursorLabel = cursorLabel[:12] + "..."
		}
	}
	c.logf("gql:searchPage", "query=%q pageSize=%d cursor=%s", truncateQuery(queryStr, 120), pageSize, cursorLabel)

	variables := map[string]any{
		"query":  githubv4.String(queryStr),
		"first":  githubv4.Int(pageSize),
		"cursor": (*githubv4.String)(nil),
	}
	if cursor != "" {
		variables["cursor"] = githubv4.NewString(githubv4.String(cursor))
	}

	var q searchQuery
	err := c.graphql.Query(ctx, &q, variables)
	if err != nil && isTransientError(err) {
		c.logf("gql:searchPage", "transient error, retrying in 3s: %v", err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(3 * time.Second):
		}
		err = c.graphql.Query(ctx, &q, variables)
	}
	if err != nil {
		c.logf("gql:searchPage", "ERROR (%s): %v", time.Since(start), err)
		return nil, fmt.Errorf("github graphql search: %w", err)
	}

	page := &PRPage{
		PageInfo: PageInfo{
			HasNextPage: q.Search.PageInfo.HasNextPage,
			EndCursor:   string(q.Search.PageInfo.EndCursor),
			TotalCount:  q.Search.IssueCount,
		},
	}
	for _, node := range q.Search.Nodes {
		page.PullRequests = append(page.PullRequests, convertPRFields(node.PullRequest))
	}

	c.logf("gql:searchPage", "OK %d PRs (total=%d hasNext=%v) in %s", len(page.PullRequests), page.PageInfo.TotalCount, page.PageInfo.HasNextPage, time.Since(start))
	return page, nil
}

// ---- Repository PR connection (bypasses search index) ----

// prFieldsLight is a minimal set of PR fields for the repository connection
// fallback. Omits reviews, review requests, assignees, and labels to avoid
// timeouts on large repos.
type prFieldsLight struct {
	ID     string `graphql:"id"`
	Number int
	Title  string
	URL    string `graphql:"url"`
	State  githubv4.PullRequestState
	Body   string

	IsDraft        bool
	IsInMergeQueue bool `graphql:"isInMergeQueue"`
	Mergeable      githubv4.MergeableState
	ReviewDecision githubv4.PullRequestReviewDecision

	Additions    int
	Deletions    int
	ChangedFiles int

	HeadRefName string
	HeadRefOid  string `graphql:"headRefOid"`
	BaseRefName string

	CreatedAt time.Time
	UpdatedAt time.Time
	MergedAt  *time.Time
	ClosedAt  *time.Time

	Author struct {
		Login     string
		AvatarURL string `graphql:"avatarUrl(size: 64)"`
	} `graphql:"author"`

	MergedBy *struct {
		Login string
	} `graphql:"mergedBy"`

	Repository struct {
		Name  string
		Owner struct {
			Login string
		}
	}

	Commits struct {
		TotalCount int
		Nodes      []struct {
			Commit struct {
				StatusCheckRollup *struct {
					State githubv4.StatusState
				}
			}
		}
	} `graphql:"commits(last: 1)"`
}

func convertPRFieldsLight(pr prFieldsLight) PullRequest {
	result := PullRequest{
		NodeID:         pr.ID,
		Number:         pr.Number,
		URL:            pr.URL,
		RepoOwner:      pr.Repository.Owner.Login,
		RepoName:       pr.Repository.Name,
		Title:          pr.Title,
		Body:           pr.Body,
		HeadRef:        pr.HeadRefName,
		HeadRefOid:     pr.HeadRefOid,
		BaseRef:        pr.BaseRefName,
		State:          string(pr.State),
		IsDraft:        pr.IsDraft,
		IsInMergeQueue: pr.IsInMergeQueue,
		Mergeable:      string(pr.Mergeable),
		ReviewDecision: string(pr.ReviewDecision),
		Additions:      pr.Additions,
		Deletions:      pr.Deletions,
		ChangedFiles:   pr.ChangedFiles,
		Author:         pr.Author.Login,
		AuthorAvatar:   pr.Author.AvatarURL,
		CreatedAt:      pr.CreatedAt,
		UpdatedAt:      pr.UpdatedAt,
		MergedAt:       pr.MergedAt,
		ClosedAt:       pr.ClosedAt,
		CommitCount:    pr.Commits.TotalCount,
	}
	if pr.MergedBy != nil {
		result.MergedBy = pr.MergedBy.Login
	}
	if len(pr.Commits.Nodes) > 0 {
		rollup := pr.Commits.Nodes[0].Commit.StatusCheckRollup
		if rollup != nil {
			result.ChecksStatus = string(rollup.State)
		}
	}
	return result
}

// repoPRsQuery queries a repository's pullRequests connection directly,
// avoiding the search index which times out on large repos.
// Uses lightweight fields to stay under GitHub's timeout.
type repoPRsQuery struct {
	Repository struct {
		PullRequests struct {
			TotalCount int
			PageInfo   struct {
				HasNextPage bool
				EndCursor   githubv4.String
			}
			Nodes []prFieldsLight
		} `graphql:"pullRequests(states: $states, first: $first, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC})"`
	} `graphql:"repository(owner: $owner, name: $name)"`
}

// fetchRepoPRs fetches PRs from a repository's pullRequests connection,
// optionally filtering by author. This is more reliable than search for large repos.
func (c *Client) fetchRepoPRs(ctx context.Context, owner, repo string, states []githubv4.PullRequestState, author string, maxPages int) ([]PullRequest, error) {
	start := time.Now()
	c.logf("gql:repoPRs", "owner=%s repo=%s states=%v author=%q maxPages=%d", owner, repo, states, author, maxPages)

	variables := map[string]any{
		"owner":  githubv4.String(owner),
		"name":   githubv4.String(repo),
		"states": states,
		"first":  githubv4.Int(50),
		"cursor": (*githubv4.String)(nil),
	}

	var allPRs []PullRequest
	pages := 0
	for pages < maxPages {
		var q repoPRsQuery
		if err := c.graphql.Query(ctx, &q, variables); err != nil {
			c.logf("gql:repoPRs", "ERROR after %d pages (%s): %v", pages, time.Since(start), err)
			return allPRs, fmt.Errorf("repository pullRequests: %w", err)
		}
		pages++

		for _, node := range q.Repository.PullRequests.Nodes {
			pr := convertPRFieldsLight(node)
			if author == "" || strings.EqualFold(pr.Author, author) {
				allPRs = append(allPRs, pr)
			}
		}

		if !q.Repository.PullRequests.PageInfo.HasNextPage {
			break
		}
		variables["cursor"] = githubv4.NewString(q.Repository.PullRequests.PageInfo.EndCursor)
	}

	c.logf("gql:repoPRs", "OK %d PRs (filtered) across %d pages in %s", len(allPRs), pages, time.Since(start))
	return allPRs, nil
}

// ---- Fetch-all variants (used by poller) ----

// GetMyOpenPRs returns ALL open PRs authored by the given user in the given org.
func (c *Client) GetMyOpenPRs(ctx context.Context, org, user string, filterBots bool, excludedRepos []string) ([]PullRequest, error) {
	query := buildQuery(fmt.Sprintf("is:pr author:%s is:open org:%s sort:updated-desc", user, org), filterBots, excludedRepos)
	return c.searchAllPRs(ctx, query)
}

// GetMyRecentMergedPRs returns ALL recently merged PRs authored by the given user.
func (c *Client) GetMyRecentMergedPRs(ctx context.Context, org, user string, since time.Time, filterBots bool, excludedRepos []string) ([]PullRequest, error) {
	query := buildQuery(fmt.Sprintf("is:pr author:%s is:merged merged:>=%s org:%s sort:updated-desc",
		user, since.Format("2006-01-02"), org), filterBots, excludedRepos)
	return c.searchAllPRs(ctx, query)
}

// GetReviewRequestsForUser returns ALL open PRs where the user has a pending review request.
// If since is non-zero, only PRs updated on or after that date are returned.
func (c *Client) GetReviewRequestsForUser(ctx context.Context, org, user string, since time.Time, filterBots bool, excludedRepos []string) ([]PullRequest, error) {
	q := fmt.Sprintf("is:pr review-requested:%s is:open org:%s sort:updated-desc", user, org)
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchAllPRs(ctx, buildQuery(q, filterBots, excludedRepos))
}

// GetTeamReviewRequests returns ALL open PRs where the given team has a pending review request.
// If since is non-zero, only PRs updated on or after that date are returned.
func (c *Client) GetTeamReviewRequests(ctx context.Context, org, team string, since time.Time, filterBots bool, excludedRepos []string) ([]PullRequest, error) {
	q := fmt.Sprintf("is:pr team-review-requested:%s/%s is:open org:%s sort:updated-desc", org, team, org)
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchAllPRs(ctx, buildQuery(q, filterBots, excludedRepos))
}

// GetReviewedByUser returns ALL open PRs that the user has reviewed.
// If since is non-zero, only PRs updated on or after that date are returned.
func (c *Client) GetReviewedByUser(ctx context.Context, org, user string, since time.Time, filterBots bool, excludedRepos []string) ([]PullRequest, error) {
	q := fmt.Sprintf("is:pr reviewed-by:%s is:open org:%s sort:updated-desc", user, org)
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchAllPRs(ctx, buildQuery(q, filterBots, excludedRepos))
}

// ---- Paginated variants (used by frontend) ----

// botExclusions is appended to search queries when bot filtering is enabled.
const botExclusions = " -author:app/dependabot -author:dependabot[bot] -author:app/renovate -author:renovate[bot] -author:app/github-actions -author:github-actions[bot] -author:app/snyk-bot -author:snyk-bot"

func buildQuery(base string, filterBots bool, excludedRepos []string) string {
	q := base
	if filterBots {
		q += botExclusions
	}
	for _, repo := range excludedRepos {
		q += " -repo:" + repo
	}
	return q
}

// GetMyOpenPRsPage returns a single page of open PRs authored by the given user.
func (c *Client) GetMyOpenPRsPage(ctx context.Context, org, user string, pageSize int, cursor string, filterBots bool, excludedRepos []string) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr author:%s is:open org:%s sort:updated-desc", user, org), filterBots, excludedRepos)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetMyRecentMergedPRsPage returns a single page of recently merged PRs.
func (c *Client) GetMyRecentMergedPRsPage(ctx context.Context, org, user string, since time.Time, pageSize int, cursor string, filterBots bool, excludedRepos []string) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr author:%s is:merged merged:>=%s org:%s sort:updated-desc",
		user, since.Format("2006-01-02"), org), filterBots, excludedRepos)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetReviewRequestsPage returns a single page of review requests for the user.
// If since is non-zero, only PRs updated on or after that date are returned.
func (c *Client) GetReviewRequestsPage(ctx context.Context, org, user string, since time.Time, pageSize int, cursor string, filterBots bool, excludedRepos []string) (*PRPage, error) {
	q := fmt.Sprintf("is:pr review-requested:%s is:open org:%s sort:updated-desc", user, org)
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchPRsPage(ctx, buildQuery(q, filterBots, excludedRepos), pageSize, cursor)
}

// GetTeamReviewRequestsPage returns a single page of team review requests.
// If since is non-zero, only PRs updated on or after that date are returned.
func (c *Client) GetTeamReviewRequestsPage(ctx context.Context, org, team string, since time.Time, pageSize int, cursor string, filterBots bool, excludedRepos []string) (*PRPage, error) {
	q := fmt.Sprintf("is:pr team-review-requested:%s/%s is:open org:%s sort:updated-desc", org, team, org)
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchPRsPage(ctx, buildQuery(q, filterBots, excludedRepos), pageSize, cursor)
}

// GetReviewedByUserPage returns a single page of PRs reviewed by the user.
// If since is non-zero, only PRs updated on or after that date are returned.
func (c *Client) GetReviewedByUserPage(ctx context.Context, org, user string, since time.Time, pageSize int, cursor string, filterBots bool, excludedRepos []string) (*PRPage, error) {
	q := fmt.Sprintf("is:pr reviewed-by:%s is:open org:%s sort:updated-desc", user, org)
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchPRsPage(ctx, buildQuery(q, filterBots, excludedRepos), pageSize, cursor)
}

// ---- Repo-scoped fetch-all variants (used by poller) ----

// GetMyOpenPRsForRepo returns ALL open PRs authored by the given user in a specific repo.
// Uses the repository PR connection (reliable on large repos) with search as fallback.
func (c *Client) GetMyOpenPRsForRepo(ctx context.Context, owner, repo, user string, filterBots bool) ([]PullRequest, error) {
	prs, err := c.fetchRepoPRs(ctx, owner, repo, []githubv4.PullRequestState{githubv4.PullRequestStateOpen}, user, 5)
	if err == nil {
		return prs, nil
	}
	c.logf("gql:repoPRs", "connection failed, falling back to search: %v", err)
	query := buildQuery(fmt.Sprintf("is:pr author:%s is:open repo:%s/%s", user, owner, repo), filterBots, nil)
	return c.searchAllPRs(ctx, query)
}

// GetMyRecentMergedPRsForRepo returns ALL recently merged PRs for a specific repo.
func (c *Client) GetMyRecentMergedPRsForRepo(ctx context.Context, owner, repo, user string, since time.Time, filterBots bool) ([]PullRequest, error) {
	query := buildQuery(fmt.Sprintf("is:pr author:%s is:merged merged:>=%s repo:%s/%s",
		user, since.Format("2006-01-02"), owner, repo), filterBots, nil)
	return c.searchAllPRs(ctx, query)
}

// GetReviewRequestsForRepo returns ALL open PRs requesting the user's review in a specific repo.
func (c *Client) GetReviewRequestsForRepo(ctx context.Context, owner, repo, user string, since time.Time, filterBots bool) ([]PullRequest, error) {
	q := fmt.Sprintf("is:pr review-requested:%s is:open repo:%s/%s", user, owner, repo)
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchAllPRs(ctx, buildQuery(q, filterBots, nil))
}

// GetReviewedByUserForRepo returns ALL open PRs reviewed by the user in a specific repo.
func (c *Client) GetReviewedByUserForRepo(ctx context.Context, owner, repo, user string, since time.Time, filterBots bool) ([]PullRequest, error) {
	q := fmt.Sprintf("is:pr reviewed-by:%s is:open repo:%s/%s", user, owner, repo)
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchAllPRs(ctx, buildQuery(q, filterBots, nil))
}

// ---- Repo-scoped paginated variants (used by frontend) ----

// GetMyOpenPRsForRepoPage returns a single page of open PRs for a specific repo.
// Uses the repository PR connection (reliable on large repos) with search as fallback.
func (c *Client) GetMyOpenPRsForRepoPage(ctx context.Context, owner, repo, user string, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	if cursor == "" {
		prs, err := c.fetchRepoPRs(ctx, owner, repo, []githubv4.PullRequestState{githubv4.PullRequestStateOpen}, user, 5)
		if err == nil {
			return &PRPage{
				PullRequests: prs,
				PageInfo:     PageInfo{TotalCount: len(prs)},
			}, nil
		}
		c.logf("gql:repoPRs", "connection failed, falling back to search: %v", err)
	}
	q := buildQuery(fmt.Sprintf("is:pr author:%s is:open repo:%s/%s", user, owner, repo), filterBots, nil)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetMyRecentMergedPRsForRepoPage returns a single page of merged PRs for a specific repo.
func (c *Client) GetMyRecentMergedPRsForRepoPage(ctx context.Context, owner, repo, user string, since time.Time, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr author:%s is:merged merged:>=%s repo:%s/%s",
		user, since.Format("2006-01-02"), owner, repo), filterBots, nil)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetReviewRequestsForRepoPage returns a single page of review requests for a specific repo.
func (c *Client) GetReviewRequestsForRepoPage(ctx context.Context, owner, repo, user string, since time.Time, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := fmt.Sprintf("is:pr review-requested:%s is:open repo:%s/%s", user, owner, repo)
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchPRsPage(ctx, buildQuery(q, filterBots, nil), pageSize, cursor)
}

// GetReviewedByUserForRepoPage returns a single page of PRs reviewed by the user for a specific repo.
func (c *Client) GetReviewedByUserForRepoPage(ctx context.Context, owner, repo, user string, since time.Time, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := fmt.Sprintf("is:pr reviewed-by:%s is:open repo:%s/%s", user, owner, repo)
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchPRsPage(ctx, buildQuery(q, filterBots, nil), pageSize, cursor)
}

// ---- Multi-repo paginated variants (used by "All Repos" mode) ----

// buildRepoScope returns a search qualifier string that scopes the query to the
// given set of repos. Each entry should be "owner/name". If the list is empty
// the returned string is empty (which effectively means unscoped).
func buildRepoScope(repos []string) string {
	if len(repos) == 0 {
		return ""
	}
	var b strings.Builder
	for _, r := range repos {
		b.WriteString(" repo:")
		b.WriteString(r)
	}
	return b.String()
}

// GetMyOpenPRsMultiRepoPage returns a single page of open PRs authored by the
// given user across all the specified repos.
func (c *Client) GetMyOpenPRsMultiRepoPage(ctx context.Context, repos []string, user string, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr author:%s is:open sort:updated-desc%s", user, buildRepoScope(repos)), filterBots, nil)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetMyRecentMergedPRsMultiRepoPage returns a single page of recently merged
// PRs across all specified repos.
func (c *Client) GetMyRecentMergedPRsMultiRepoPage(ctx context.Context, repos []string, user string, since time.Time, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr author:%s is:merged merged:>=%s sort:updated-desc%s",
		user, since.Format("2006-01-02"), buildRepoScope(repos)), filterBots, nil)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetReviewRequestsMultiRepoPage returns a single page of review requests
// across all specified repos.
func (c *Client) GetReviewRequestsMultiRepoPage(ctx context.Context, repos []string, user string, since time.Time, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := fmt.Sprintf("is:pr review-requested:%s is:open sort:updated-desc%s", user, buildRepoScope(repos))
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchPRsPage(ctx, buildQuery(q, filterBots, nil), pageSize, cursor)
}

// GetReviewedByUserMultiRepoPage returns a single page of PRs reviewed by the
// user across all specified repos.
func (c *Client) GetReviewedByUserMultiRepoPage(ctx context.Context, repos []string, user string, since time.Time, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := fmt.Sprintf("is:pr reviewed-by:%s is:open sort:updated-desc%s", user, buildRepoScope(repos))
	if !since.IsZero() {
		q += fmt.Sprintf(" updated:>=%s", since.Format("2006-01-02"))
	}
	return c.searchPRsPage(ctx, buildQuery(q, filterBots, nil), pageSize, cursor)
}

// ---- On-demand detail queries (used by PRDetailPage) ----

// checkRunsQuery fetches individual check runs for a PR by node ID.
type checkRunsQuery struct {
	Node struct {
		PullRequest struct {
			Commits struct {
				Nodes []struct {
					Commit struct {
						CheckSuites struct {
							Nodes []struct {
								CheckRuns struct {
									Nodes []struct {
										Name       string
										Status     githubv4.CheckStatusState
										Conclusion githubv4.CheckConclusionState
										DetailsURL string `graphql:"detailsUrl"`
									}
								} `graphql:"checkRuns(first: 50)"`
							}
						} `graphql:"checkSuites(first: 20)"`
					}
				}
			} `graphql:"commits(last: 1)"`
		} `graphql:"... on PullRequest"`
	} `graphql:"node(id: $id)"`
}

// GetPRCheckRuns fetches individual CI check runs for a pull request.
func (c *Client) GetPRCheckRuns(ctx context.Context, nodeID string) ([]CheckRun, error) {
	start := time.Now()
	c.logf("gql:checkRuns", "nodeID=%s", nodeID)

	variables := map[string]any{
		"id": githubv4.ID(nodeID),
	}

	var q checkRunsQuery
	if err := c.graphql.Query(ctx, &q, variables); err != nil {
		c.logf("gql:checkRuns", "ERROR (%s): %v", time.Since(start), err)
		return nil, fmt.Errorf("github graphql check runs: %w", err)
	}

	var runs []CheckRun
	for _, commitNode := range q.Node.PullRequest.Commits.Nodes {
		for _, suite := range commitNode.Commit.CheckSuites.Nodes {
			for _, run := range suite.CheckRuns.Nodes {
				runs = append(runs, CheckRun{
					Name:       run.Name,
					Status:     string(run.Status),
					Conclusion: string(run.Conclusion),
					DetailsURL: run.DetailsURL,
				})
			}
		}
	}
	c.logf("gql:checkRuns", "OK %d runs in %s", len(runs), time.Since(start))
	return runs, nil
}

// prCommentsQuery fetches top-level comments and review threads for a PR.
type prCommentsQuery struct {
	Node struct {
		PullRequest struct {
			Comments struct {
				Nodes []struct {
					ID     string `graphql:"id"`
					URL    string `graphql:"url"`
					Author struct {
						Login     string
						AvatarURL string `graphql:"avatarUrl(size: 32)"`
					}
					Body      string
					CreatedAt time.Time
				}
			} `graphql:"comments(first: 100)"`

			ReviewThreads struct {
				Nodes []struct {
					ID         string `graphql:"id"`
					IsResolved bool
					Path       string
					Line       int
					Comments   struct {
						Nodes []struct {
							ID     string `graphql:"id"`
							URL    string `graphql:"url"`
							Author struct {
								Login     string
								AvatarURL string `graphql:"avatarUrl(size: 32)"`
							}
							Body      string
							Path      string
							Line      int    `graphql:"originalLine"`
							DiffHunk  string `graphql:"diffHunk"`
							CreatedAt time.Time
						}
					} `graphql:"comments(first: 50)"`
				}
			} `graphql:"reviewThreads(first: 100)"`
		} `graphql:"... on PullRequest"`
	} `graphql:"node(id: $id)"`
}

// singlePRQuery fetches a single pull request by owner/repo/number using the
// repository { pullRequest(number:) } pattern.
type singlePRQuery struct {
	Repository struct {
		PullRequest prFields `graphql:"pullRequest(number: $number)"`
	} `graphql:"repository(owner: $owner, name: $name)"`
}

// GetSinglePR fetches a single pull request by owner, repo name, and number.
func (c *Client) GetSinglePR(ctx context.Context, owner, repoName string, number int) (*PullRequest, error) {
	start := time.Now()
	c.logf("gql:singlePR", "%s/%s#%d", owner, repoName, number)

	variables := map[string]any{
		"owner":  githubv4.String(owner),
		"name":   githubv4.String(repoName),
		"number": githubv4.Int(number),
	}

	var q singlePRQuery
	if err := c.graphql.Query(ctx, &q, variables); err != nil {
		c.logf("gql:singlePR", "ERROR (%s): %v", time.Since(start), err)
		return nil, fmt.Errorf("github graphql single PR: %w", err)
	}

	result := convertPRFields(q.Repository.PullRequest)
	c.logf("gql:singlePR", "OK %s/%s#%d %q in %s", owner, repoName, number, result.Title, time.Since(start))
	return &result, nil
}

// singlePRByNodeIDQuery fetches a single PR by its GraphQL node ID.
type singlePRByNodeIDQuery struct {
	Node struct {
		PullRequest prFields `graphql:"... on PullRequest"`
	} `graphql:"node(id: $id)"`
}

// GetSinglePRByNodeID fetches a single pull request by its GraphQL node ID.
func (c *Client) GetSinglePRByNodeID(ctx context.Context, nodeID string) (*PullRequest, error) {
	start := time.Now()
	c.logf("gql:singlePR", "nodeID=%s", nodeID)

	variables := map[string]any{
		"id": githubv4.ID(nodeID),
	}

	var q singlePRByNodeIDQuery
	if err := c.graphql.Query(ctx, &q, variables); err != nil {
		c.logf("gql:singlePR", "ERROR (%s): %v", time.Since(start), err)
		return nil, fmt.Errorf("github graphql single PR by node ID: %w", err)
	}

	result := convertPRFields(q.Node.PullRequest)
	c.logf("gql:singlePR", "OK #%d %q in %s", result.Number, result.Title, time.Since(start))
	return &result, nil
}

// GetPRComments fetches all comments and review threads for a pull request.
func (c *Client) GetPRComments(ctx context.Context, nodeID string) (*PRComments, error) {
	start := time.Now()
	c.logf("gql:comments", "nodeID=%s", nodeID)

	variables := map[string]any{
		"id": githubv4.ID(nodeID),
	}

	var q prCommentsQuery
	if err := c.graphql.Query(ctx, &q, variables); err != nil {
		c.logf("gql:comments", "ERROR (%s): %v", time.Since(start), err)
		return nil, fmt.Errorf("github graphql pr comments: %w", err)
	}

	result := &PRComments{}

	for _, c := range q.Node.PullRequest.Comments.Nodes {
		result.IssueComments = append(result.IssueComments, IssueComment{
			ID:           c.ID,
			URL:          c.URL,
			Author:       c.Author.Login,
			AuthorAvatar: c.Author.AvatarURL,
			Body:         c.Body,
			CreatedAt:    c.CreatedAt,
		})
	}

	for _, t := range q.Node.PullRequest.ReviewThreads.Nodes {
		thread := ReviewThread{
			ID:         t.ID,
			IsResolved: t.IsResolved,
			Path:       t.Path,
			Line:       t.Line,
		}
		for _, c := range t.Comments.Nodes {
			thread.Comments = append(thread.Comments, ReviewComment{
				ID:           c.ID,
				Author:       c.Author.Login,
				AuthorAvatar: c.Author.AvatarURL,
				Body:         c.Body,
				Path:         c.Path,
				Line:         c.Line,
				DiffHunk:     c.DiffHunk,
				CreatedAt:    c.CreatedAt,
			})
		}
		// Use the first comment's URL as the thread's permalink.
		if len(thread.Comments) > 0 && t.Comments.Nodes[0].URL != "" {
			thread.URL = t.Comments.Nodes[0].URL
		}
		result.ReviewThreads = append(result.ReviewThreads, thread)
	}

	c.logf("gql:comments", "OK %d comments + %d threads in %s", len(result.IssueComments), len(result.ReviewThreads), time.Since(start))
	return result, nil
}

// prCommitsQuery fetches commits for a PR by node ID.
type prCommitsQuery struct {
	Node struct {
		PullRequest struct {
			Commits struct {
				Nodes []struct {
					Commit struct {
						OID             string `graphql:"oid"`
						MessageHeadline string
						Message         string
						Additions       int
						Deletions       int
						Author          struct {
							Name string
							User *struct {
								Login     string
								AvatarURL string `graphql:"avatarUrl(size: 32)"`
							}
						}
						CommittedDate time.Time
					}
				}
			} `graphql:"commits(first: 250)"`
		} `graphql:"... on PullRequest"`
	} `graphql:"node(id: $id)"`
}

// GetPRCommits fetches all commits for a pull request.
func (c *Client) GetPRCommits(ctx context.Context, nodeID string) ([]PRCommit, error) {
	start := time.Now()
	c.logf("gql:commits", "nodeID=%s", nodeID)

	variables := map[string]any{
		"id": githubv4.ID(nodeID),
	}

	var q prCommitsQuery
	if err := c.graphql.Query(ctx, &q, variables); err != nil {
		c.logf("gql:commits", "ERROR (%s): %v", time.Since(start), err)
		return nil, fmt.Errorf("github graphql pr commits: %w", err)
	}

	var commits []PRCommit
	for _, n := range q.Node.PullRequest.Commits.Nodes {
		cm := n.Commit
		commit := PRCommit{
			OID:             cm.OID,
			MessageHeadline: cm.MessageHeadline,
			Message:         cm.Message,
			AuthorName:      cm.Author.Name,
			Additions:       cm.Additions,
			Deletions:       cm.Deletions,
			CommittedDate:   cm.CommittedDate,
		}
		if cm.Author.User != nil {
			commit.AuthorLogin = cm.Author.User.Login
			commit.AuthorAvatar = cm.Author.User.AvatarURL
		}
		commits = append(commits, commit)
	}
	c.logf("gql:commits", "OK %d commits in %s", len(commits), time.Since(start))
	return commits, nil
}

// GetRepoLabels fetches all labels for a repository.
func (c *Client) GetRepoLabels(ctx context.Context, owner, repo string) ([]Label, error) {
	var query struct {
		Repository struct {
			Labels struct {
				Nodes []struct {
					ID    string `graphql:"id"`
					Name  string
					Color string
				}
				PageInfo struct {
					HasNextPage bool
					EndCursor   string
				}
			} `graphql:"labels(first: 100, after: $cursor, orderBy: {field: NAME, direction: ASC})"`
		} `graphql:"repository(owner: $owner, name: $repo)"`
	}

	vars := map[string]any{
		"owner":  githubv4.String(owner),
		"repo":   githubv4.String(repo),
		"cursor": (*githubv4.String)(nil),
	}

	var all []Label
	for {
		if err := c.graphql.Query(ctx, &query, vars); err != nil {
			return nil, fmt.Errorf("get repo labels: %w", err)
		}
		for _, l := range query.Repository.Labels.Nodes {
			all = append(all, Label{ID: l.ID, Name: l.Name, Color: l.Color})
		}
		if !query.Repository.Labels.PageInfo.HasNextPage {
			break
		}
		cursor := githubv4.String(query.Repository.Labels.PageInfo.EndCursor)
		vars["cursor"] = &cursor
	}
	return all, nil
}
