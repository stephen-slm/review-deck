package github

import (
	"context"
	"fmt"
	"time"

	"github.com/shurcooL/githubv4"
)

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
		}
	} `graphql:"reviews(first: 50)"`
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
			allPRs = append(allPRs, convertPRFields(node.PullRequest))
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
		page.PullRequests = append(page.PullRequests, convertPRFields(node.PullRequest))
	}

	return page, nil
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
func (c *Client) GetReviewRequestsForUser(ctx context.Context, org, user string, filterBots bool, excludedRepos []string) ([]PullRequest, error) {
	query := buildQuery(fmt.Sprintf("is:pr review-requested:%s is:open org:%s sort:updated-desc", user, org), filterBots, excludedRepos)
	return c.searchAllPRs(ctx, query)
}

// GetTeamReviewRequests returns ALL open PRs where the given team has a pending review request.
func (c *Client) GetTeamReviewRequests(ctx context.Context, org, team string, filterBots bool, excludedRepos []string) ([]PullRequest, error) {
	query := buildQuery(fmt.Sprintf("is:pr team-review-requested:%s/%s is:open org:%s sort:updated-desc", org, team, org), filterBots, excludedRepos)
	return c.searchAllPRs(ctx, query)
}

// GetReviewedByUser returns ALL open PRs that the user has reviewed.
func (c *Client) GetReviewedByUser(ctx context.Context, org, user string, filterBots bool, excludedRepos []string) ([]PullRequest, error) {
	query := buildQuery(fmt.Sprintf("is:pr reviewed-by:%s is:open org:%s sort:updated-desc", user, org), filterBots, excludedRepos)
	return c.searchAllPRs(ctx, query)
}

// ---- Paginated variants (used by frontend) ----

// botExclusions is appended to search queries when bot filtering is enabled.
const botExclusions = " -author:app/dependabot -author:app/renovate -author:app/github-actions -author:app/snyk-bot"

func buildQuery(base string, filterBots bool, excludedRepos []string) string {
	q := base
	if filterBots {
		q += botExclusions
	}
	for _, repo := range excludedRepos {
		q += fmt.Sprintf(" -repo:%s", repo)
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
func (c *Client) GetReviewRequestsPage(ctx context.Context, org, user string, pageSize int, cursor string, filterBots bool, excludedRepos []string) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr review-requested:%s is:open org:%s sort:updated-desc", user, org), filterBots, excludedRepos)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetTeamReviewRequestsPage returns a single page of team review requests.
func (c *Client) GetTeamReviewRequestsPage(ctx context.Context, org, team string, pageSize int, cursor string, filterBots bool, excludedRepos []string) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr team-review-requested:%s/%s is:open org:%s sort:updated-desc", org, team, org), filterBots, excludedRepos)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
}

// GetReviewedByUserPage returns a single page of PRs reviewed by the user.
func (c *Client) GetReviewedByUserPage(ctx context.Context, org, user string, pageSize int, cursor string, filterBots bool, excludedRepos []string) (*PRPage, error) {
	q := buildQuery(fmt.Sprintf("is:pr reviewed-by:%s is:open org:%s sort:updated-desc", user, org), filterBots, excludedRepos)
	return c.searchPRsPage(ctx, q, pageSize, cursor)
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
	variables := map[string]interface{}{
		"id": githubv4.ID(nodeID),
	}

	var q checkRunsQuery
	if err := c.graphql.Query(ctx, &q, variables); err != nil {
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
							Line      int `graphql:"originalLine"`
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
	variables := map[string]interface{}{
		"owner":  githubv4.String(owner),
		"name":   githubv4.String(repoName),
		"number": githubv4.Int(number),
	}

	var q singlePRQuery
	if err := c.graphql.Query(ctx, &q, variables); err != nil {
		return nil, fmt.Errorf("github graphql single PR: %w", err)
	}

	result := convertPRFields(q.Repository.PullRequest)
	return &result, nil
}

// GetPRComments fetches all comments and review threads for a pull request.
func (c *Client) GetPRComments(ctx context.Context, nodeID string) (*PRComments, error) {
	variables := map[string]interface{}{
		"id": githubv4.ID(nodeID),
	}

	var q prCommentsQuery
	if err := c.graphql.Query(ctx, &q, variables); err != nil {
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
				CreatedAt:    c.CreatedAt,
			})
		}
		// Use the first comment's URL as the thread's permalink.
		if len(thread.Comments) > 0 && t.Comments.Nodes[0].URL != "" {
			thread.URL = t.Comments.Nodes[0].URL
		}
		result.ReviewThreads = append(result.ReviewThreads, thread)
	}

	return result, nil
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

	vars := map[string]interface{}{
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
