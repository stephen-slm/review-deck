package services

import (
	"strconv"
	"time"

	"review-deck/internal/storage"
)

// filterBotsEnabled reads the filter_bots setting from the database.
func filterBotsEnabled(db *storage.DB) bool {
	val, err := db.GetSetting("filter_bots")
	if err != nil {
		return false
	}
	return val == "true"
}

// reviewMaxAgeDays reads the review_max_age_days setting from the database.
// Returns the configured value clamped to [1, 90], or 7 as a default.
func reviewMaxAgeDays(db *storage.DB) int {
	val, err := db.GetSetting("review_max_age_days")
	if err != nil || val == "" {
		return 7
	}
	days, err := strconv.Atoi(val)
	if err != nil || days < 1 {
		return 7
	}
	return min(days, 90)
}

// reviewSince returns the cutoff time for review-related queries based on the
// review_max_age_days setting.
func reviewSince(db *storage.DB) time.Time {
	return time.Now().AddDate(0, 0, -reviewMaxAgeDays(db))
}

// excludedReposForOrg returns excluded repos for an org formatted as "org/repo"
// for use in GitHub search query exclusion.
func excludedReposForOrg(db *storage.DB, org string) []string {
	repos, err := db.GetExcludedRepos(org)
	if err != nil {
		return nil
	}
	qualified := make([]string, len(repos))
	for i, r := range repos {
		qualified[i] = org + "/" + r
	}
	return qualified
}
