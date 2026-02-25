package main

import (
	"fmt"
	"os"
	"sort"

	"pull-request-reviewing/internal/calendar"
	"pull-request-reviewing/internal/git"
	"pull-request-reviewing/internal/must"
	"pull-request-reviewing/internal/reporting"

	"github.com/gocarina/gocsv"
	"go.uber.org/zap"
)

func processCompany(logger *zap.Logger, input map[calendar.Month][]*git.PullRequest) {
	csvPathAll := fmt.Sprintf("./output/company/%d/%d-output.csv", year, year)
	resultAll := map[string]*reporting.CompanyMetrics{}

	for _, data := range input {
		for _, entry := range data {
			if entry.Bot() {
				continue
			}

			users := []string{entry.Author()}
			for _, review := range entry.Reviews {
				if review.Bot() {
					continue
				}
				users = append(users, review.Logon())
			}

			for _, user := range users {
				if _, ok := resultAll[user]; !ok {
					resultAll[user] = &reporting.CompanyMetrics{Logon: user}
				}
				resultAll[user].Add(entry)
			}
		}
	}

	writeCompanyMetrics(resultAll, csvPathAll)
	logger.Info("completed company - csv")
}

func writeCompanyMetrics(result map[string]*reporting.CompanyMetrics, csvPath string) {
	var resultSlice []*reporting.CompanyMetrics
	for _, metrics := range result {
		resultSlice = append(resultSlice, metrics)
	}

	sort.Slice(resultSlice, func(i, j int) bool {
		return resultSlice[i].CreatedPRs > resultSlice[j].CreatedPRs
	})

	csvContent := must.MustValue(gocsv.MarshalBytes(&resultSlice))
	file := must.MustValue(os.Create(csvPath))

	must.MustValue(file.Write(csvContent))
	must.Must(file.Close())
}
