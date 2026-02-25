package git

import (
	"sync"
	"time"

	"review-deck/internal/must"

	"github.com/gofri/go-github-ratelimit/v2/github_ratelimit"
	"github.com/gofri/go-github-ratelimit/v2/github_ratelimit/github_primary_ratelimit"
	"github.com/gofri/go-github-ratelimit/v2/github_ratelimit/github_secondary_ratelimit"
	"github.com/google/go-github/v80/github"
	"go.uber.org/zap"
	"golang.org/x/time/rate"
)

type config struct {
	apiToken string
	logger   *zap.Logger
}

type Client struct {
	Logger       *zap.Logger
	Limiter      *rate.Limiter
	Mx           *sync.RWMutex
	githubClient *github.Client
}

func MustNew(options ...Option) *Client {
	c, err := New(options...)

	if err != nil {
		panic(err)
	}

	return c
}

func New(options ...Option) (*Client, error) {
	c := config{
		logger:   must.MustValue(zap.NewDevelopment()),
		apiToken: "",
	}

	for _, option := range options {
		if err := option(&c); err != nil {
			return nil, err
		}
	}

	rateLimiter := github_ratelimit.NewClient(nil,
		github_primary_ratelimit.WithLimitDetectedCallback(func(ctx *github_primary_ratelimit.CallbackContext) {
			c.logger.Debug("primary rate limit detected; sleeping",
				zap.String("category", string(ctx.Category)),
				zap.Time("resetTime", ctx.ResetTime.UTC()),
			)

			t := *ctx.ResetTime
			time.Sleep(time.Until(t.Add(time.Minute * 5)))
		}),

		github_secondary_ratelimit.WithLimitDetectedCallback(func(ctx *github_secondary_ratelimit.CallbackContext) {
			c.logger.Debug("secondary rate limit detected",
				zap.Duration("total-sleep-time", *ctx.TotalSleepTime),
				zap.Time("resetTime", ctx.ResetTime.UTC()),
			)
		}))

	client := github.NewClient(rateLimiter).
		WithAuthToken(c.apiToken)

	gitClient := &Client{
		Logger:       c.logger,
		githubClient: client, Mx: &sync.RWMutex{},
		Limiter: rate.NewLimiter(10, 10),
	}

	RateLimiterBasic.Limiter = gitClient.Limiter
	RateLimiterBasic.Logger = gitClient.Logger

	return gitClient, nil
}
