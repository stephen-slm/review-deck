package github

import (
	"context"
	"net/http"

	"github.com/shurcooL/githubv4"
	"golang.org/x/oauth2"
)

// Client wraps both the GitHub GraphQL and REST clients.
type Client struct {
	graphql *githubv4.Client
	token   string
}

// NewClient creates a new GitHub client with the given personal access token.
func NewClient(token string) (*Client, error) {
	src := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)
	httpClient := oauth2.NewClient(context.Background(), src)

	gqlClient := githubv4.NewClient(httpClient)

	return &Client{
		graphql: gqlClient,
		token:   token,
	}, nil
}

// HTTPClient returns an authenticated HTTP client for REST calls.
func (c *Client) HTTPClient() *http.Client {
	src := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: c.token},
	)
	return oauth2.NewClient(context.Background(), src)
}
