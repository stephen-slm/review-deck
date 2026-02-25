package git

import (
	"context"
	"fmt"
	"strings"
	"time"

	team "review-deck/internal/teams"

	"github.com/google/go-github/v80/github"
	"golang.org/x/sync/errgroup"
)

type Review struct {
	*github.PullRequestReview
}

func (p *Review) Bot() bool {
	return strings.EqualFold(p.GetUser().GetType(), "bot")
}

func (p *Review) Logon() string {
	return p.GetUser().GetLogin()
}

type PullRequest struct {
	PullRequest *github.PullRequest
	Reviews     []*Review
}

// IsReviewer checks whether the given user is a reviewer of the pull request.
func (p *PullRequest) IsReviewer(logon string) bool {
	for _, reviewer := range p.Reviews {
		if strings.EqualFold(reviewer.GetUser().GetLogin(), logon) {
			return true
		}
	}

	return false
}

func (p *PullRequest) Approved() bool {
	for _, review := range p.Reviews {
		if strings.EqualFold(review.GetUser().GetLogin(), p.PullRequest.GetUser().GetLogin()) {
			// skip self approvals.
			continue
		}

		if strings.EqualFold(review.GetState(), "approved") &&
			!strings.EqualFold(review.GetUser().GetType(), "bot") {
			return true
		}
	}
	return false
}

func (p *PullRequest) ApprovedBy(logon string) bool {
	for _, review := range p.Reviews {
		if strings.EqualFold(review.GetState(), "approved") &&
			strings.EqualFold(review.GetUser().GetLogin(), logon) {
			return true
		}
	}
	return false
}

func (p *PullRequest) Author() string {
	return p.PullRequest.GetUser().GetLogin()
}

func (p *PullRequest) Bot() bool {
	return strings.EqualFold(p.PullRequest.GetUser().GetType(), "bot")
}

func (p *PullRequest) IsOwner(logon string) bool {
	return strings.EqualFold(p.PullRequest.GetUser().GetLogin(), logon)
}

type SearchOptionsGetAllPrs struct {
	MergedOnly       bool
	IncludeReviewers bool
}

func (c *Client) GetAllPrs(
	ctx context.Context,
	since time.Time,
	end time.Time,
	opts SearchOptionsGetAllPrs,
) ([]*PullRequest, error) {
	search := &SearchIssues{
		Client: c,
		Search: NewSearchBuilder().
			Org("paxosglobal").
			PR(true).
			StartTime(since).
			EndTime(end).
			Merged(opts.MergedOnly).
			Build(),
	}

	issues, err := Paginator(ctx, search, ProcessBasic, RateLimiterBasic)

	if err != nil {
		return nil, fmt.Errorf("error getting issues: %w", err)
	}

	return c.getPullRequestsFromIssues(ctx, issues, opts.IncludeReviewers)
}

type SearchOptionsGetAuthorPRs struct {
	MergedOnly       bool
	IncludeReviewers bool
}

func (c *Client) GetAuthorPRs(
	ctx context.Context,
	person team.Person,
	since time.Time,
	end time.Time,
	opts SearchOptionsGetAuthorPRs,
) ([]*PullRequest, error) {
	search := &SearchIssues{
		Client: c,
		Search: NewSearchBuilder().
			Org("paxosglobal").
			PR(true).
			StartTime(since).
			EndTime(end).
			Merged(opts.MergedOnly).
			Author(person.Logon).
			Build(),
	}

	issues, err := Paginator(ctx, search, ProcessBasic, RateLimiterBasic)

	if err != nil {
		return nil, fmt.Errorf("error getting issues: %w", err)
	}

	return c.getPullRequestsFromIssues(ctx, issues, opts.IncludeReviewers)
}

type SearchOptionsGetPRsReviewedBy struct {
	IncludeReviewers bool
	FilterAuthored   bool
	MergedOnly       bool
}

func (c *Client) GetPRsReviewedBy(
	ctx context.Context,
	person team.Person,
	since time.Time,
	end time.Time,
	opts SearchOptionsGetPRsReviewedBy,
) ([]*PullRequest, error) {
	search := &SearchIssues{
		Client: c,
		Search: NewSearchBuilder().
			Org("paxosglobal").
			PR(true).
			StartTime(since).
			EndTime(end).
			Merged(opts.MergedOnly).
			ReviewedBy(person.Logon).
			Build(),
	}

	issues, err := Paginator(ctx, search, ProcessBasic, RateLimiterBasic)

	filteredIssues := make([]*github.Issue, 0, len(issues))
	for _, issue := range issues {
		if opts.FilterAuthored && strings.EqualFold(issue.GetUser().GetLogin(), person.Logon) {
			continue
		}
		filteredIssues = append(filteredIssues, issue)
	}

	if err != nil {
		return nil, fmt.Errorf("error getting issues: %w", err)
	}

	return c.getPullRequestsFromIssues(ctx, filteredIssues, opts.IncludeReviewers)
}

func (c *Client) getPullRequestsFromIssues(
	ctx context.Context,
	issues []*github.Issue,
	reviewers bool,
) ([]*PullRequest, error) {
	result := make([]*PullRequest, len(issues))

	g := errgroup.Group{}
	for i, issue := range issues {
		g.Go(func() error {
			split := strings.Split(issue.GetRepositoryURL(), "/")

			owner := split[len(split)-2]
			repo := split[len(split)-1]

			var pr *github.PullRequest
			var reviews []*Review

			innerG := errgroup.Group{}
			innerG.Go(func() (err error) {
				pr, _, err = Execute(ctx, c, func() (*github.PullRequest, *github.Response, error) {
					return c.githubClient.PullRequests.Get(ctx, owner, repo, issue.GetNumber())
				})
				return err
			})

			innerG.Go(func() (err error) {
				if !reviewers {
					return nil
				}

				result, _, err := Execute(ctx, c, func() ([]*github.PullRequestReview, *github.Response, error) {
					return c.githubClient.PullRequests.ListReviews(ctx, owner, repo, issue.GetNumber(), &github.ListOptions{
						Page:    1,
						PerPage: 100,
					})
				})

				for _, review := range result {
					reviews = append(reviews, &Review{review})
				}

				return err
			})

			if err := innerG.Wait(); err != nil {
				return fmt.Errorf("error getting pull request: %w", err)
			}

			result[i] = &PullRequest{
				PullRequest: pr,
				Reviews:     reviews,
			}

			return nil
		})

	}

	return result, g.Wait()
}
