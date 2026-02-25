package git

import (
	"go.uber.org/zap"
)

type Option func(client *config) error

func WithToken(token string) Option {
	return func(c *config) error {
		c.apiToken = token
		return nil
	}
}

func WithLogger(logger *zap.Logger) Option {
	return func(c *config) error {
		c.logger = logger
		return nil
	}
}
