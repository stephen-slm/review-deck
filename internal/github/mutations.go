package github

import (
	"context"
	"fmt"

	"github.com/shurcooL/githubv4"
)

// MergePR merges a pull request by its node ID.
func (c *Client) MergePR(ctx context.Context, prNodeID string, method githubv4.PullRequestMergeMethod) error {
	var mutation struct {
		MergePullRequest struct {
			PullRequest struct {
				State  githubv4.PullRequestState
				Merged bool
			}
		} `graphql:"mergePullRequest(input: $input)"`
	}

	input := githubv4.MergePullRequestInput{
		PullRequestID: githubv4.ID(prNodeID),
		MergeMethod:   &method,
	}

	err := c.graphql.Mutate(ctx, &mutation, input, nil)
	if err != nil {
		return fmt.Errorf("merge pull request: %w", err)
	}
	return nil
}

// ApprovePR submits an approving review on a pull request.
func (c *Client) ApprovePR(ctx context.Context, prNodeID string, body string) error {
	var mutation struct {
		AddPullRequestReview struct {
			PullRequestReview struct {
				ID string `graphql:"id"`
			}
		} `graphql:"addPullRequestReview(input: $input)"`
	}

	event := githubv4.PullRequestReviewEventApprove
	input := githubv4.AddPullRequestReviewInput{
		PullRequestID: githubv4.ID(prNodeID),
		Event:         &event,
	}
	if body != "" {
		b := githubv4.String(body)
		input.Body = &b
	}

	err := c.graphql.Mutate(ctx, &mutation, input, nil)
	if err != nil {
		return fmt.Errorf("approve pull request: %w", err)
	}
	return nil
}

// RequestReviews adds reviewers to a pull request.
func (c *Client) RequestReviews(ctx context.Context, prNodeID string, userIDs []string, teamIDs []string) error {
	var mutation struct {
		RequestReviews struct {
			PullRequest struct {
				ID string `graphql:"id"`
			}
		} `graphql:"requestReviews(input: $input)"`
	}

	gqlUserIDs := make([]githubv4.ID, len(userIDs))
	for i, id := range userIDs {
		gqlUserIDs[i] = githubv4.ID(id)
	}
	gqlTeamIDs := make([]githubv4.ID, len(teamIDs))
	for i, id := range teamIDs {
		gqlTeamIDs[i] = githubv4.ID(id)
	}

	input := githubv4.RequestReviewsInput{
		PullRequestID: githubv4.ID(prNodeID),
		UserIDs:       &gqlUserIDs,
		TeamIDs:       &gqlTeamIDs,
	}

	err := c.graphql.Mutate(ctx, &mutation, input, nil)
	if err != nil {
		return fmt.Errorf("request reviews: %w", err)
	}
	return nil
}
