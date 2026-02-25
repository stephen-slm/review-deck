package git

import (
	"context"

	"github.com/google/go-github/v80/github"
	"go.uber.org/zap"
	"golang.org/x/time/rate"
)

var RateLimiterBasic = &RateLimiter{}

type RateLimiter struct {
	Limiter *rate.Limiter
	Logger  *zap.Logger
}

func (r *RateLimiter) RateLimit(ctx context.Context, resp *github.Response) (bool, error) {
	// if r.Limiter != nil {
	// 	if err := r.Limiter.Wait(ctx); err != nil {
	// 		return false, err
	// 	}
	// }
	//
	// r.Logger.Debug("github remaining rate",
	// 	zap.Int("remaining", resp.Rate.Remaining),
	// 	zap.Int("used", resp.Rate.Used),
	// 	zap.Int("limit", resp.Rate.Limit),
	// 	zap.Time("reset", resp.Rate.Reset.Time),
	// )
	//
	// if resp.Rate.Remaining <= 5 {
	// 	r.Logger.Warn("rate limit reached, sleeping until reset",
	// 		zap.Int("remaining", resp.Rate.Remaining),
	// 		zap.Int("used", resp.Rate.Used),
	// 		zap.Int("limit", resp.Rate.Limit),
	// 		zap.Time("reset", resp.Rate.Reset.Time))
	//
	// 	time.Sleep(time.Until(resp.Rate.Reset.Time.UTC().Add(time.Minute)))
	// }
	return true, nil
}
