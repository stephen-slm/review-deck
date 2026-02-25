package main

import (
	"context"
	"encoding/json"
	"os"

	"pull-request-reviewing/internal/git"
	"pull-request-reviewing/internal/must"

	"go.uber.org/zap"
)

var (
	TeamOutputFile = "./output/teams.json"
)

func main() {
	ctx := context.Background()
	logger := must.MustValue(zap.NewDevelopment())

	client := git.MustNew(
		git.WithToken(os.Getenv("GITHUB_ACCESS_TOKEN")),
		git.WithLogger(logger),
	)

	if _, err := os.Stat(TeamOutputFile); err == nil {
		logger.Info("file already exists, skipping", zap.String("outputFile", TeamOutputFile))
		return
	}

	teams := must.MustValue(client.GetAllTeams(ctx))

	jsonContent := must.MustValue(json.MarshalIndent(&teams, "", " "))
	file := must.MustValue(os.Create("./output/teams.json"))

	must.MustValue(file.Write(jsonContent))
	must.Must(file.Close())
}
