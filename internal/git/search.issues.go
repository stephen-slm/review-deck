package git

import (
	"context"

	"github.com/google/go-github/v80/github"
)

type SearchIssues struct {
	Search string
	Client *Client
}

func (l *SearchIssues) List(ctx context.Context, opt *github.ListOptions) ([]*github.Issue, *github.Response, error) {
	searchOptions := &github.SearchOptions{}

	if opt != nil {
		searchOptions.ListOptions = *opt
	}

	issues, response, err := Execute(ctx, l.Client, func() (*github.IssuesSearchResult, *github.Response, error) {
		return l.Client.githubClient.Search.Issues(ctx, l.Search, searchOptions)
	})

	if err != nil {
		return nil, response, err
	}

	if issues != nil {
		return issues.Issues, response, err
	}

	return nil, response, err
}
