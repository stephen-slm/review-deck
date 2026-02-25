package github

import (
	"context"

	"github.com/shurcooL/githubv4"
)

// RateLimitInfo holds the current rate limit state.
type RateLimitInfo struct {
	Limit     int    `json:"limit"`
	Remaining int    `json:"remaining"`
	Cost      int    `json:"cost"`
	ResetAt   string `json:"resetAt"`
}

// GetRateLimit returns the current GraphQL API rate limit status.
func (c *Client) GetRateLimit(ctx context.Context) (*RateLimitInfo, error) {
	var query struct {
		RateLimit struct {
			Limit     int
			Remaining int
			Cost      int
			ResetAt   githubv4.DateTime
		}
	}

	err := c.graphql.Query(ctx, &query, nil)
	if err != nil {
		return nil, err
	}

	return &RateLimitInfo{
		Limit:     query.RateLimit.Limit,
		Remaining: query.RateLimit.Remaining,
		Cost:      query.RateLimit.Cost,
		ResetAt:   query.RateLimit.ResetAt.Format("2006-01-02T15:04:05Z"),
	}, nil
}
