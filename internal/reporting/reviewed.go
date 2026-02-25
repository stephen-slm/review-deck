package reporting

import (
	"strings"

	"pull-request-reviewing/internal/git"
	team "pull-request-reviewing/internal/teams"
)

// ReviewedMetrics represents statistical metrics for code reviews.
type ReviewedMetrics struct {
	Logon   string        `csv:"logon"`
	Display string        `csv:"display"`
	Team    []team.Person `json:"-" csv:"-"`

	Total    int `csv:"total"`
	External int `csv:"external"`
	Internal int `csv:"internal"`

	TotalCommits      int `csv:"total_commits"`
	TotalAdditional   int `csv:"total_additions"`
	TotalDeletions    int `csv:"total_deletions"`
	TotalChangedFiles int `csv:"total_changed_files"`
	TotalMerged       int `csv:"total_merged"`
	TotalApproved     int `csv:"total_approved"`

	seen map[int64]bool `csv:"-"`
}

func (r *ReviewedMetrics) Add(pr *git.PullRequest) {
	if strings.EqualFold(pr.PullRequest.GetUser().GetLogin(), r.Logon) {
		return
	}

	if !pr.IsReviewer(r.Logon) {
		return
	}

	if r.seen == nil {
		r.seen = make(map[int64]bool)
	}

	if r.seen[pr.PullRequest.GetID()] {
		return
	}

	r.seen[pr.PullRequest.GetID()] = true

	r.TotalCommits += pr.PullRequest.GetCommits()
	r.TotalAdditional += pr.PullRequest.GetAdditions()
	r.TotalDeletions += pr.PullRequest.GetDeletions()
	r.TotalChangedFiles += pr.PullRequest.GetChangedFiles()

	if pr.PullRequest.GetMerged() {
		r.TotalMerged += 1
	}

	for _, reviewers := range pr.Reviews {
		if strings.EqualFold(reviewers.GetUser().GetLogin(), r.Logon) &&
			strings.EqualFold(reviewers.GetState(), "approved") {
			r.TotalApproved += 1
			break
		}
	}

	internal := false
	for _, person := range r.Team {
		if strings.EqualFold(pr.PullRequest.GetUser().GetLogin(),
			person.Logon) {
			internal = true
			r.Internal += 1
			break
		}
	}

	if !internal {
		r.External += 1
	}

	r.Total += 1
}
