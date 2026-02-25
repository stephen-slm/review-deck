package git

import (
	"context"

	"github.com/google/go-github/v80/github"
)

func MustExecute[T any](ctx context.Context, c *Client, method func() (T, *github.Response, error)) (T, *github.Response) {
	val, resp, err := Execute(ctx, c, method)

	if err != nil {
		panic(err)
	}

	return val, resp
}

func Execute[T any](ctx context.Context, c *Client, method func() (T, *github.Response, error)) (T, *github.Response, error) {
	var defaultVal T

	if err := c.Limiter.Wait(ctx); err != nil {
		return defaultVal, nil, err
	}

	val, resp, err := method()

	if resp != nil && resp.StatusCode == 422 {
		return val, resp, nil
	}

	if err != nil {
		return val, resp, err
	}

	// c.Logger.Debug("github remaining rate",
	// 	zap.Int("remaining", resp.Rate.Remaining),
	// 	zap.Int("used", resp.Rate.Used),
	// 	zap.Int("limit", resp.Rate.Limit),
	// 	zap.Time("reset", resp.Rate.Reset.Time),
	// )

	rateCheck := 10

	if resp.Rate.Limit > 100 {
		rateCheck = 50
	}

	if resp.Rate.Remaining <= rateCheck {
		// c.Logger.Warn("rate limit reached, sleeping until reset",
		// 	zap.Int("remaining", resp.Rate.Remaining),
		// 	zap.Int("used", resp.Rate.Used),
		// 	zap.Int("limit", resp.Rate.Limit),
		// 	zap.Time("reset", resp.Rate.Reset.Time))

		// time.Sleep(time.Until(resp.Rate.Reset.Time.UTC().Add(time.Minute)))
	}

	return val, resp, err
}
