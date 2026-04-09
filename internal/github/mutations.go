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

// EnqueuePR adds a pull request to the repository's merge queue.
func (c *Client) EnqueuePR(ctx context.Context, prNodeID string) error {
	var mutation struct {
		EnqueuePullRequest struct {
			MergeQueueEntry struct {
				ID string `graphql:"id"`
			}
		} `graphql:"enqueuePullRequest(input: $input)"`
	}

	input := githubv4.EnqueuePullRequestInput{
		PullRequestID: githubv4.ID(prNodeID),
	}

	err := c.graphql.Mutate(ctx, &mutation, input, nil)
	if err != nil {
		return fmt.Errorf("enqueue pull request: %w", err)
	}
	return nil
}

// ResolveThread resolves a review thread by its node ID.
func (c *Client) ResolveThread(ctx context.Context, threadID string) error {
	var mutation struct {
		ResolveReviewThread struct {
			Thread struct {
				ID         string `graphql:"id"`
				IsResolved bool
			} `graphql:"thread"`
		} `graphql:"resolveReviewThread(input: $input)"`
	}

	input := githubv4.ResolveReviewThreadInput{
		ThreadID: githubv4.ID(threadID),
	}

	err := c.graphql.Mutate(ctx, &mutation, input, nil)
	if err != nil {
		return fmt.Errorf("resolve review thread: %w", err)
	}
	return nil
}

// UnresolveThread unresolves a review thread by its node ID.
func (c *Client) UnresolveThread(ctx context.Context, threadID string) error {
	var mutation struct {
		UnresolveReviewThread struct {
			Thread struct {
				ID         string `graphql:"id"`
				IsResolved bool
			} `graphql:"thread"`
		} `graphql:"unresolveReviewThread(input: $input)"`
	}

	input := githubv4.UnresolveReviewThreadInput{
		ThreadID: githubv4.ID(threadID),
	}

	err := c.graphql.Mutate(ctx, &mutation, input, nil)
	if err != nil {
		return fmt.Errorf("unresolve review thread: %w", err)
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

// RequestChangesPR submits a "request changes" review on a pull request.
// A non-empty body is required by the GitHub API for change-request reviews.
func (c *Client) RequestChangesPR(ctx context.Context, prNodeID string, body string) error {
	var mutation struct {
		AddPullRequestReview struct {
			PullRequestReview struct {
				ID string `graphql:"id"`
			}
		} `graphql:"addPullRequestReview(input: $input)"`
	}

	event := githubv4.PullRequestReviewEventRequestChanges
	b := githubv4.String(body)
	input := githubv4.AddPullRequestReviewInput{
		PullRequestID: githubv4.ID(prNodeID),
		Event:         &event,
		Body:          &b,
	}

	err := c.graphql.Mutate(ctx, &mutation, input, nil)
	if err != nil {
		return fmt.Errorf("request changes on pull request: %w", err)
	}
	return nil
}

// AddLabels adds labels to a pull request (or any labelable).
func (c *Client) AddLabels(ctx context.Context, labelableID string, labelIDs []string) error {
	var mutation struct {
		AddLabelsToLabelable struct {
			Labelable struct {
				Typename string `graphql:"__typename"`
			} `graphql:"labelable"`
		} `graphql:"addLabelsToLabelable(input: $input)"`
	}

	gqlIDs := make([]githubv4.ID, len(labelIDs))
	for i, id := range labelIDs {
		gqlIDs[i] = githubv4.ID(id)
	}

	input := githubv4.AddLabelsToLabelableInput{
		LabelableID: githubv4.ID(labelableID),
		LabelIDs:    gqlIDs,
	}

	if err := c.graphql.Mutate(ctx, &mutation, input, nil); err != nil {
		return fmt.Errorf("add labels: %w", err)
	}
	return nil
}

// RemoveLabels removes labels from a pull request (or any labelable).
func (c *Client) RemoveLabels(ctx context.Context, labelableID string, labelIDs []string) error {
	var mutation struct {
		RemoveLabelsFromLabelable struct {
			Labelable struct {
				Typename string `graphql:"__typename"`
			} `graphql:"labelable"`
		} `graphql:"removeLabelsFromLabelable(input: $input)"`
	}

	gqlIDs := make([]githubv4.ID, len(labelIDs))
	for i, id := range labelIDs {
		gqlIDs[i] = githubv4.ID(id)
	}

	input := githubv4.RemoveLabelsFromLabelableInput{
		LabelableID: githubv4.ID(labelableID),
		LabelIDs:    gqlIDs,
	}

	if err := c.graphql.Mutate(ctx, &mutation, input, nil); err != nil {
		return fmt.Errorf("remove labels: %w", err)
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

// AddPRReviewThread creates a new review thread (inline comment) on a pull request.
func (c *Client) AddPRReviewThread(ctx context.Context, prNodeID string, body string, path string, line int) (string, error) {
	var mutation struct {
		AddPullRequestReviewThread struct {
			Thread struct {
				ID string `graphql:"id"`
			} `graphql:"thread"`
		} `graphql:"addPullRequestReviewThread(input: $input)"`
	}

	prID := githubv4.ID(prNodeID)
	p := githubv4.String(path)
	l := githubv4.Int(line)
	side := githubv4.DiffSideRight
	input := githubv4.AddPullRequestReviewThreadInput{
		PullRequestID: &prID,
		Body:          githubv4.String(body),
		Path:          &p,
		Line:          &l,
		Side:          &side,
	}

	err := c.graphql.Mutate(ctx, &mutation, input, nil)
	if err != nil {
		return "", fmt.Errorf("add review thread: %w", err)
	}
	return mutation.AddPullRequestReviewThread.Thread.ID, nil
}

// AddComment adds a top-level comment to a pull request (or issue).
func (c *Client) AddComment(ctx context.Context, subjectNodeID string, body string) (string, error) {
	var mutation struct {
		AddComment struct {
			CommentEdge struct {
				Node struct {
					ID string `graphql:"id"`
				}
			} `graphql:"commentEdge"`
		} `graphql:"addComment(input: $input)"`
	}

	input := githubv4.AddCommentInput{
		SubjectID: githubv4.ID(subjectNodeID),
		Body:      githubv4.String(body),
	}

	err := c.graphql.Mutate(ctx, &mutation, input, nil)
	if err != nil {
		return "", fmt.Errorf("add comment: %w", err)
	}
	return mutation.AddComment.CommentEdge.Node.ID, nil
}

// ReplyToThread adds a reply comment to an existing review thread.
func (c *Client) ReplyToThread(ctx context.Context, threadID string, body string) (string, error) {
	var mutation struct {
		AddPullRequestReviewThreadReply struct {
			Comment struct {
				ID string `graphql:"id"`
			} `graphql:"comment"`
		} `graphql:"addPullRequestReviewThreadReply(input: $input)"`
	}

	input := githubv4.AddPullRequestReviewThreadReplyInput{
		PullRequestReviewThreadID: githubv4.ID(threadID),
		Body:                      githubv4.String(body),
	}

	err := c.graphql.Mutate(ctx, &mutation, input, nil)
	if err != nil {
		return "", fmt.Errorf("reply to review thread: %w", err)
	}
	return mutation.AddPullRequestReviewThreadReply.Comment.ID, nil
}

// MarkReadyForReview marks a draft pull request as ready for review.
func (c *Client) MarkReadyForReview(ctx context.Context, prNodeID string) error {
	var mutation struct {
		MarkPullRequestReadyForReview struct {
			PullRequest struct {
				ID string `graphql:"id"`
			}
		} `graphql:"markPullRequestReadyForReview(input: $input)"`
	}

	input := githubv4.MarkPullRequestReadyForReviewInput{
		PullRequestID: githubv4.ID(prNodeID),
	}

	err := c.graphql.Mutate(ctx, &mutation, input, nil)
	if err != nil {
		return fmt.Errorf("mark ready for review: %w", err)
	}
	return nil
}
