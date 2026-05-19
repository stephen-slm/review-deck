package github

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"github.com/shurcooL/githubv4"
	"golang.org/x/oauth2"
)

// LogFunc is called with a tag and message for each query execution.
type LogFunc func(tag, detail string)

// Client wraps both the GitHub GraphQL and REST clients.
type Client struct {
	graphql *githubv4.Client
	token   string
	logFn   LogFunc
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

// SetLogFunc sets the logging callback for query tracing.
func (c *Client) SetLogFunc(fn LogFunc) {
	c.logFn = fn
}

func (c *Client) logf(tag, format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	log.Printf("[github] %s: %s", tag, msg)
	if c.logFn != nil {
		c.logFn(tag, msg)
	}
}

// HTTPClient returns an authenticated HTTP client for REST calls.
func (c *Client) HTTPClient() *http.Client {
	src := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: c.token},
	)
	return oauth2.NewClient(context.Background(), src)
}
