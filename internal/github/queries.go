package github

import (
	"context"
	"fmt"
	"time"

	"github.com/shurcooL/githubv4"
)

// prSearchNode matches the shape of a PullRequest inside a search result.
type prSearchNode struct {
	PullRequest struct {
		ID     string `graphql:"id"`
		Number int
		Title  string
		URL    string `graphql:"url"`
		State  githubv4.PullRequestState
		Body   string

		IsDraft        bool
		Mergeable      githubv4.MergeableState
		ReviewDecision githubv4.PullRequestReviewDecision

		Additions    int
		Deletions    int
		ChangedFiles int

		HeadRefName string
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
			}
		} `graphql:"reviews(first: 50)"`
	} `graphql:"... on PullRequest"`
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

// convertSearchNode converts a GraphQL search node to our domain PullRequest.
func convertSearchNode(node prSearchNode) PullRequest {
	pr := node.PullRequest
	result := PullRequest{
		NodeID:         pr.ID,
		Number:         pr.Number,
		URL:            pr.URL,
		RepoOwner:      pr.Repository.Owner.Login,
		RepoName:       pr.Repository.Name,
		Title:          pr.Title,
		Body:           pr.Body,
		HeadRef:        pr.HeadRefName,
		BaseRef:        pr.BaseRefName,
		State:          string(pr.State),
		IsDraft:        pr.IsDraft,
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
		result.Labels = append(result.Labels, Label{Name: l.Name, Color: l.Color})
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
	variables := map[string]interface{}{
		"query":  githubv4.String(queryStr),
		"first":  githubv4.Int(50),
		"cursor": (*githubv4.String)(nil),
	}

	var allPRs []PullRequest
	for {
		var q searchQuery
		err := c.graphql.Query(ctx, &q, variables)
		if err != nil {
			return nil, fmt.Errorf("github graphql search: %w", err)
		}

		for _, node := range q.Search.Nodes {
			allPRs = append(allPRs, convertSearchNode(node))
		}

		if !q.Search.PageInfo.HasNextPage {
			break
		}
		variables["cursor"] = githubv4.NewString(q.Search.PageInfo.EndCursor)
	}

	return allPRs, nil
}

// searchPRsPage fetches a single page of search results (used by frontend-facing services).
// cursor should be "" for the first page.
func (c *Client) searchPRsPage(ctx context.Context, queryStr string, pageSize int, cursor string) (*PRPage, error) {
	if pageSize <= 0 || pageSize > 50 {
		pageSize = 10
	}

	variables := map[string]interface{}{
		"query":  githubv4.String(queryStr),
		"first":  githubv4.Int(pageSize),
		"cursor": (*githubv4.String)(nil),
	}
	if cursor != "" {
		variables["cursor"] = githubv4.NewString(githubv4.String(cursor))
	}

	var q searchQuery
	if err := c.graphql.Query(ctx, &q, variables); err != nil {
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
		page.PullRequests = append(page.PullRequests, convertSearchNode(node))
	}

	return page, nil
}

// ---- Fetch-all variants (used by poller) ----

// GetMyOpenPRs returns ALL open PRs authored by the given user in the given org.
func (c *Client) GetMyOpenPRs(ctx context.Context, org, user string, filterBots bool) ([]PullRequest, error) {
	query := buildQuery(fmt.Sprintf("is:pr author:%s is:open org:%s sort:updated-desc", user, org), filterBots)
	return c.searchAllPRs(ctx, query)
}

// GetMyRecentMergedPRs returns ALL recently merged PRs authored by the given user.
func (c *Client) GetMyRecentMergedPRs(ctx context.Context, org, user string, since time.Time, filterBots bool) ([]PullRequest, error) {
	query := buildQuery(fmt.Sprintf("is:pr author:%s is:merged merged:>=%s org:%s sort:updated-desc",
		user, since.Format("2006-01-02"), org), filterBots)
	return c.searchAllPRs(ctx, query)
}

// GetReviewRequestsForUser returns ALL open PRs where the user has a pending review request.
func (c *Client) GetReviewRequestsForUser(ctx context.Context, org, user string, filterBots bool) ([]PullRequest, error) {
	query := buildQuery(fmt.Sprintf("is:pr review-requested:%s is:open org:%s sort:updated-desc", user, org), filterBots)
	return c.searchAllPRs(ctx, query)
}

// GetTeamReviewRequests returns ALL open PRs where the given team has a pending review request.
func (c *Client) GetTeamReviewRequests(ctx context.Context, org, team string, filterBots bool) ([]PullRequest, error) {
	query := buildQuery(fmt.Sprintf("is:pr team-review-requested:%s/%s is:open org:%s sort:updated-desc", org, team, org), filterBots)
	return c.searchAllPRs(ctx, query)
}

// GetReviewedByUser returns ALL open PRs that the user has reviewed.
func (c *Client) GetReviewedByUser(ctx context.Context, org, user string, filterBots bool) ([]PullRequest, error) {
	query := buildQuery(fmt.Sprintf("is:pr reviewed-by:%s is:open org:%s sort:updated-desc", user, org), filterBots)
	return c.searchAllPRs(ctx, query)
}

// ---- Paginated variants (used by frontend) ----

// botExclusions is appended to search queries when bot filtering is enabled.
const botExclusions = " -author:app/dependabot -author:app/renovate -author:app/github-actions -author:app/snyk-bot"

func buildQuery(base string, filterBots bool) string {
	if filterBots {
		return base + botExclusions
	}
	return base
}

// GetMyOpenPRsPage returns a single page of open PRs authored by the given user.
func (c *Client) GetMyOpenPRsPage(ctx context.Context, org, user string, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr author:%s is:open org:%s sort:updated-desc", user, org), filterBots)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetMyRecentMergedPRsPage returns a single page of recently merged PRs.
func (c *Client) GetMyRecentMergedPRsPage(ctx context.Context, org, user string, since time.Time, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr author:%s is:merged merged:>=%s org:%s sort:updated-desc",
		user, since.Format("2006-01-02"), org), filterBots)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetReviewRequestsPage returns a single page of review requests for the user.
func (c *Client) GetReviewRequestsPage(ctx context.Context, org, user string, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr review-requested:%s is:open org:%s sort:updated-desc", user, org), filterBots)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetTeamReviewRequestsPage returns a single page of team review requests.
func (c *Client) GetTeamReviewRequestsPage(ctx context.Context, org, team string, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr team-review-requested:%s/%s is:open org:%s sort:updated-desc", org, team, org), filterBots)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetReviewedByUserPage returns a single page of PRs reviewed by the user.
func (c *Client) GetReviewedByUserPage(ctx context.Context, org, user string, pageSize int, cursor string, filterBots bool) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr reviewed-by:%s is:open org:%s sort:updated-desc", user, org), filterBots)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}
