package redis

import (
	"context"

	"github.com/redis/go-redis/v9"
)

func NewClient(redisURL string) (*redis.Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}

	if opts.TLSConfig != nil {
		opts.TLSConfig.InsecureSkipVerify = true
	}

	client := redis.NewClient(opts)
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}

	return client, nil
}
