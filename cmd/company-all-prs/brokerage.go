package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"pull-request-reviewing/internal/calendar"
	"pull-request-reviewing/internal/git"
	"pull-request-reviewing/internal/must"
	"pull-request-reviewing/internal/reporting"
	team "pull-request-reviewing/internal/teams"

	"github.com/gocarina/gocsv"
	"go.uber.org/zap"
)

func processBrokerageTeamPRsCreated(logger *zap.Logger, input map[calendar.Month][]*git.PullRequest) {
	jsonPathAll := fmt.Sprintf("./output/company/%d/team/brokerage/raw-revewed-%d.json", year, year)
	resultAll := map[string][]*git.PullRequest{}

	for _, person := range team.Brokerage {
		resultAll[person.Logon] = make([]*git.PullRequest, 0)
	}

	for month, data := range input {
		jsonPath := fmt.Sprintf("./output/company/%d/team/brokerage/raw-reviewed-%s.json", year, month.String())
		result := map[string][]*git.PullRequest{}

		for _, person := range team.Brokerage {
			result[person.Logon] = make([]*git.PullRequest, 0)
		}

		for _, entry := range data {
			for _, person := range team.Brokerage {
				if entry.IsOwner(person.Logon) {
					result[person.Logon] = append(result[person.Logon], entry)
					resultAll[person.Logon] = append(resultAll[person.Logon], entry)
				}
			}
		}

		writeJson(result, jsonPath)
		logger.Info("brokerage month completed - reviewed",
			zap.String("month", month.String()),
			zap.Int("total", len(resultAll)))
	}

	writeJson(resultAll, jsonPathAll)
	logger.Info("brokerage all completed - reviewed",
		zap.Int("year", year),
		zap.Int("total", len(resultAll)))
}

func processBrokerageTeamReviewed(logger *zap.Logger, input map[calendar.Month][]*git.PullRequest) {
	csvPathAll := fmt.Sprintf("./output/company/%d/team/brokerage/revewed-%d.csv", year, year)
	resultAll := map[string]*reporting.ReviewedMetrics{}

	for _, person := range team.Brokerage {
		resultAll[person.Logon] = &reporting.ReviewedMetrics{
			Logon:   person.Logon,
			Display: person.DisplayName,
			Team:    team.Brokerage,
		}
	}

	for month, data := range input {
		csvPath := fmt.Sprintf("./output/company/%d/team/brokerage/reviewed-%s.csv", year, month.String())
		result := map[string]*reporting.ReviewedMetrics{}

		for _, person := range team.Brokerage {
			result[person.Logon] = &reporting.ReviewedMetrics{
				Logon:   person.Logon,
				Display: person.DisplayName,
				Team:    team.Brokerage,
			}
		}

		for _, entry := range data {
			for _, person := range team.Brokerage {
				if entry.IsReviewer(person.Logon) {
					result[person.Logon].Add(entry)
					resultAll[person.Logon].Add(entry)
				}
			}
		}

		writeReviewedMetrics(result, csvPath)
		logger.Info("brokerage month completed - reviewed",
			zap.String("month", month.String()),
			zap.Int("total", len(resultAll)))
	}

	writeReviewedMetrics(resultAll, csvPathAll)
	logger.Info("brokerage all completed - reviewed",
		zap.Int("year", year),
		zap.Int("total", len(resultAll)))
}

func processBrokerageTeamCreated(logger *zap.Logger, input map[calendar.Month][]*git.PullRequest) {
	csvPathAll := fmt.Sprintf("./output/company/%d/team/brokerage/created-%d.csv", year, year)
	resultAll := map[string]*reporting.CreatedMetrics{}

	for _, person := range team.Brokerage {
		resultAll[person.Logon] = &reporting.CreatedMetrics{
			Logon:   person.Logon,
			Display: person.DisplayName,
		}
	}

	for month, data := range input {
		csvPath := fmt.Sprintf("./output/company/%d/team/brokerage/created-%s.csv", year, month.String())
		result := map[string]*reporting.CreatedMetrics{}

		for _, person := range team.Brokerage {
			result[person.Logon] = &reporting.CreatedMetrics{
				Logon:   person.Logon,
				Display: person.DisplayName,
			}
		}

		for _, entry := range data {
			if _, ok := result[entry.Author()]; !ok {
				continue
			}

			result[entry.Author()].Add(entry)
			resultAll[entry.Author()].Add(entry)
		}

		writeCreatedMetrics(result, csvPath)
		logger.Info("brokerage month completed - created",
			zap.String("month", month.String()),
			zap.Int("prs", len(resultAll)))
	}

	writeCreatedMetrics(resultAll, csvPathAll)
	logger.Info("brokerage all completed - created",
		zap.Int("year", year),
		zap.Int("total", len(resultAll)))
}

func writeCreatedMetrics(result map[string]*reporting.CreatedMetrics, csvPath string) {
	var resultSlice []*reporting.CreatedMetrics
	for _, metrics := range result {
		resultSlice = append(resultSlice, metrics)
	}

	sort.Slice(resultSlice, func(i, j int) bool {
		return resultSlice[i].Total > resultSlice[j].Total
	})

	csvContent := must.MustValue(gocsv.MarshalBytes(&resultSlice))
	file := must.MustValue(os.Create(csvPath))

	must.MustValue(file.Write(csvContent))
	must.Must(file.Close())
}

func writeJson(result any, path string) {
	csvContent := must.MustValue(json.MarshalIndent(result, "", " "))
	file := must.MustValue(os.Create(path))
	must.MustValue(file.Write(csvContent))
	must.Must(file.Close())
}

func writeReviewedMetrics(result map[string]*reporting.ReviewedMetrics, csvPath string) {
	var resultSlice []*reporting.ReviewedMetrics
	for _, metrics := range result {
		resultSlice = append(resultSlice, metrics)
	}

	sort.Slice(resultSlice, func(i, j int) bool {
		return resultSlice[i].Total > resultSlice[j].Total
	})

	csvContent := must.MustValue(gocsv.MarshalBytes(&resultSlice))
	file := must.MustValue(os.Create(csvPath))

	must.MustValue(file.Write(csvContent))
	must.Must(file.Close())
}
