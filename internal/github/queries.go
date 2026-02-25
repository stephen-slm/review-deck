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
		}

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

		StatusCheckRollup *struct {
			State githubv4.StatusState
		} `graphql:"commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }"`
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

	return result
}

// searchPRs performs a paginated search and returns domain PullRequests.
func (c *Client) searchPRs(ctx context.Context, queryStr string) ([]PullRequest, error) {
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

// GetMyOpenPRs returns open PRs authored by the given user in the given org.
func (c *Client) GetMyOpenPRs(ctx context.Context, org, user string) ([]PullRequest, error) {
	query := fmt.Sprintf("is:pr author:%s is:open org:%s sort:updated-desc", user, org)
	return c.searchPRs(ctx, query)
}

// GetMyRecentMergedPRs returns recently merged PRs authored by the given user.
func (c *Client) GetMyRecentMergedPRs(ctx context.Context, org, user string, since time.Time) ([]PullRequest, error) {
	query := fmt.Sprintf("is:pr author:%s is:merged merged:>=%s org:%s sort:updated-desc",
		user, since.Format("2006-01-02"), org)
	return c.searchPRs(ctx, query)
}

// GetReviewRequestsForUser returns open PRs where the user has a pending review request.
func (c *Client) GetReviewRequestsForUser(ctx context.Context, org, user string) ([]PullRequest, error) {
	query := fmt.Sprintf("is:pr review-requested:%s is:open org:%s sort:updated-desc", user, org)
	return c.searchPRs(ctx, query)
}

// GetTeamReviewRequests returns open PRs where the given team has a pending review request.
func (c *Client) GetTeamReviewRequests(ctx context.Context, org, team string) ([]PullRequest, error) {
	query := fmt.Sprintf("is:pr team-review-requested:%s/%s is:open org:%s sort:updated-desc", org, team, org)
	return c.searchPRs(ctx, query)
}

// GetReviewedByUser returns open PRs that the user has reviewed.
func (c *Client) GetReviewedByUser(ctx context.Context, org, user string) ([]PullRequest, error) {
	query := fmt.Sprintf("is:pr reviewed-by:%s is:open org:%s sort:updated-desc", user, org)
	return c.searchPRs(ctx, query)
}
