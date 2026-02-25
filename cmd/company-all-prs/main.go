package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"

	"pull-request-reviewing/internal/calendar"
	"pull-request-reviewing/internal/git"
	"pull-request-reviewing/internal/must"
	"pull-request-reviewing/internal/reporting"

	"github.com/gocarina/gocsv"
	"go.uber.org/zap"
)

var (
	year   = 2026
	months = []calendar.Month{calendar.January, calendar.February}
)

func main() {
	ctx := context.Background()

	client := git.MustNew(
		git.WithToken(os.Getenv("GITHUB_ACCESS_TOKEN")),
		git.WithLogger(logger),
	)
	logger := must.MustValue(zap.NewDevelopment())

	folderPath := fmt.Sprintf("./output/company/%d/", year)
	if _, err := os.Stat(folderPath); os.IsNotExist(err) {
		must.Must(os.MkdirAll(folderPath, os.ModePerm))
	}

	pullDataSet(ctx, client, logger, year, months)
	data := loadDataSet(logger, year, months)

	wg := sync.WaitGroup{}
	wg.Add(4)

	go func() {
		defer wg.Done()
		processCompany(logger, data)
	}()
	go func() {
		defer wg.Done()
		processBrokerageTeamCreated(logger, data)
	}()
	go func() {
		defer wg.Done()
		processBrokerageTeamReviewed(logger, data)
	}()
	go func() {
		defer wg.Done()
		processBrokerageTeamPRsCreated(logger, data)
	}()

	wg.Wait()
}

func pullDataSet(ctx context.Context, client *git.Client, logger *zap.Logger, year int, months []calendar.Month) {
	for _, month := range months {
		for _, week := range month.Weeks(year) {
			outputFile := fmt.Sprintf("./output/company/%d/%s-week-%s-all.json", year, month.String(), week.String())

			logger.Info("starting", zap.String("outputFile", outputFile),
				zap.String("start", week.Start(year).Format("2006-01-02")),
				zap.String("end", week.End(year).Format("2006-01-02")),
			)

			if _, err := os.Stat(outputFile); err == nil {
				logger.Info("file already exists, skipping", zap.String("outputFile", outputFile))
				continue
			}

			prs := must.MustValue(client.GetAllPrs(ctx,
				week.Start(year),
				week.End(year),
				git.SearchOptionsGetAllPrs{
					MergedOnly:       false,
					IncludeReviewers: true,
				},
			))

			data := must.MustValue(json.MarshalIndent(prs, "", " "))
			file := must.MustValue(os.Create(outputFile))

			must.MustValue(file.Write(data))
			must.Must(file.Close())

			logger.Info("completed", zap.String("outputFile", outputFile),
				zap.String("start", week.Start(year).Format("2006-01-02")),
				zap.String("end", week.End(year).Format("2006-01-02")),
				zap.Int("prs", len(prs)),
			)
		}
	}
}

func loadDataSet(logger *zap.Logger, year int, months []calendar.Month) map[calendar.Month][]*git.PullRequest {
	pullRequests := map[calendar.Month][]*git.PullRequest{}

	for _, month := range months {
		pullRequests[month] = make([]*git.PullRequest, 0)

		for _, week := range month.Weeks(year) {
			filePath := fmt.Sprintf("./output/company/%d/%s-week-%s-all.json", year, month.String(), week.String())

			if _, err := os.Stat(filePath); os.IsNotExist(err) {
				continue
			}

			jsonFile := must.MustValue(os.Open(filePath))

			byteValue := must.MustValue(io.ReadAll(jsonFile))
			must.Must(jsonFile.Close())

			var data []*git.PullRequest
			must.Must(json.Unmarshal(byteValue, &data))

			logger.Info("parsed", zap.Int("prs", len(data)), zap.String("file", filePath))
			pullRequests[month] = append(pullRequests[month], data...)

		}
	}

	return pullRequests
}

func writeSingleEntry(result []*reporting.PrFlat, csvPath string) {
	csvContent := must.MustValue(gocsv.MarshalBytes(&result))
	file := must.MustValue(os.Create(csvPath))

	must.MustValue(file.Write(csvContent))
	must.Must(file.Close())
}
