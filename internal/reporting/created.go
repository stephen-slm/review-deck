package reporting

import (
	"strings"

	"pull-request-reviewing/internal/git"
)

type CreatedMetrics struct {
	Logon   string `csv:"logon"`
	Display string `csv:"display"`

	Total int `csv:"total"`

	TotalCommits      int `csv:"total_commits"`
	TotalAdditions    int `csv:"total_additions"`
	TotalDeletions    int `csv:"total_deletions"`
	TotalChangedFiles int `csv:"total_changed_files"`
	TotalMerged       int `csv:"total_merged"`
	TotalClosed       int `csv:"total_closed"`
	TotalApproved     int `csv:"total_approved"`

	seen map[int64]bool `csv:"-"`
}

func (r *CreatedMetrics) Add(pr *git.PullRequest) {
	if !strings.EqualFold(pr.PullRequest.GetUser().GetLogin(), r.Logon) {
		return
	}

	if r.seen == nil {
		r.seen = make(map[int64]bool)
	}

	if r.seen[pr.PullRequest.GetID()] {
		return
	}

	r.seen[pr.PullRequest.GetID()] = true

	r.Total += 1

	r.TotalCommits += pr.PullRequest.GetCommits()
	r.TotalAdditions += pr.PullRequest.GetAdditions()
	r.TotalDeletions += pr.PullRequest.GetDeletions()
	r.TotalChangedFiles += pr.PullRequest.GetChangedFiles()

	if pr.PullRequest.GetMerged() {
		r.TotalMerged += 1
	}
	if !pr.PullRequest.GetMerged() && pr.PullRequest.ClosedAt != nil {
		r.TotalClosed += 1
	}

	if pr.Approved() {
		r.TotalApproved += 1
	}
}
