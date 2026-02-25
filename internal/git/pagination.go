package git

import (
	"context"

	"github.com/google/go-github/v80/github"
)

// ListFunc is an interface that returns a list of items for the given type
// for example it could be:
//
//	type SearchIssues struct {
//		Client *github.Client
//	}
//
//	func (l *SearchIssues) List(ctx context.Context, opt *github.ListOptions) ([]*github.Repository, *github.Response, error) {
//		t, r, err := l.Client.Apps.ListRepos(ctx, opt)
//		return t.Repositories, r, err
//	}
type ListFunc[T any] interface {
	List(ctx context.Context, opt *github.ListOptions) ([]T, *github.Response, error)
}

// ProcessFunc is a function that processes an item for the given type
// this is optional as the user may not want to process the items so
// they can input a skip function that does nothing
// example:
//
//	type Process struct {
//		Client *github.Client
//	}
//
//	func (p *Process) Process(ctx context.Context, item *github.Repository) error {
//		fmt.Println(item.GetName())
//		return nil
//	}
type ProcessFunc[T any] interface {
	Process(ctx context.Context, item T) error
}

// RateLimitFunc is a function that handles rate limiting
// it returns a bool to indicate if the pagination should continue
// and an error if the users wishes to return more information/errors
// example:
//
//	type RateLimiter struct {
//	}
//
//	func (r *RateLimiter) RateLimit(ctx context.Context, resp *github.Response) (bool, error) {
//		return true, nil
//	}
type RateLimitFunc interface {
	RateLimit(ctx context.Context, resp *github.Response) (bool, error)
}

func Paginator[T any](ctx context.Context, listFunc ListFunc[T], processFunc ProcessFunc[any], rateLimitFunc RateLimitFunc) ([]T, error) {
	var allItems []T

	opts := listOpts(nil)

	for {
		items, resp, err := listFunc.List(ctx, opts)

		if resp != nil && resp.StatusCode == 422 {
			return allItems, nil
		}

		if err != nil {
			return allItems, err
		}

		allItems = append(allItems, items...)

		for _, item := range items {
			if err = processFunc.Process(ctx, item); err != nil {
				return allItems, err
			}
		}

		// Handle rate limits
		shouldContinue, err := rateLimitFunc.RateLimit(ctx, resp)
		if err != nil {
			return allItems, err
		}

		if !shouldContinue {
			break
		}

		if resp.NextPage == 0 {
			break
		}

		opts.Page = resp.NextPage
	}

	return allItems, nil
}

func listOpts(opts *github.ListOptions) *github.ListOptions {
	if opts == nil {
		return &github.ListOptions{PerPage: 100, Page: 1}
	}
	if opts.PerPage == 0 {
		opts.PerPage = 100
	}

	return opts
}
