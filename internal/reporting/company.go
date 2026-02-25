package reporting

import (
	"time"

	"pull-request-reviewing/internal/git"

	"github.com/google/go-github/v80/github"
)

type PrFlat struct {
	ID                  *int64     `csv:"id"`
	Number              *int       `csv:"number"`
	State               *string    `csv:"state"`
	Locked              *bool      `csv:"locked"`
	Title               *string    `csv:"title,"`
	CreatedAt           *time.Time `csv:"created_at"`
	UpdatedAt           *time.Time `csv:"updated_at"`
	ClosedAt            *time.Time `csv:"closed_at"`
	MergedAt            *time.Time `csv:"merged_at"`
	Author              string     `csv:"author"`
	Merged              *bool      `csv:"merged"`
	Mergeable           *bool      `csv:"mergeable"`
	MergeableState      *string    `csv:"mergeable_state"`
	Rebaseable          *bool      `csv:"rebaseable"`
	MergedBy            string     `csv:"merged_by"`
	Comments            *int       `csv:"comments"`
	Commits             *int       `csv:"commits"`
	Additions           *int       `csv:"additions"`
	Deletions           *int       `csv:"deletions"`
	ChangedFiles        *int       `csv:"changed_files"`
	MaintainerCanModify *bool      `csv:"maintainer_can_modify"`
	ReviewComments      *int       `csv:"review_comments"`
}

func NewPrFlat(pr *github.PullRequest) *PrFlat {
	return &PrFlat{
		ID:                  pr.ID,
		Number:              pr.Number,
		State:               pr.State,
		Locked:              pr.Locked,
		Title:               pr.Title,
		CreatedAt:           pr.CreatedAt.GetTime(),
		UpdatedAt:           pr.UpdatedAt.GetTime(),
		ClosedAt:            pr.ClosedAt.GetTime(),
		MergedAt:            pr.MergedAt.GetTime(),
		Author:              pr.GetUser().GetLogin(),
		Merged:              pr.Merged,
		Mergeable:           pr.Mergeable,
		MergeableState:      pr.MergeableState,
		Rebaseable:          pr.Rebaseable,
		MergedBy:            pr.MergedBy.GetLogin(),
		Comments:            pr.Comments,
		Commits:             pr.Commits,
		Additions:           pr.Additions,
		Deletions:           pr.Deletions,
		ChangedFiles:        pr.ChangedFiles,
		MaintainerCanModify: pr.MaintainerCanModify,
		ReviewComments:      pr.ReviewComments,
	}
}

type CompanyMetrics struct {
	Logon string `csv:"logon"`

	CreatedPRs  int `csv:"created_prs"`
	ReviewedPrs int `csv:"reviewed_prs"`

	TotalPersonalCommits      int `csv:"total_personal_commits"`
	TotalPersonalAdditions    int `csv:"total_personal_additions"`
	TotalPersonalDeletions    int `csv:"total_personal_deletions"`
	TotalPersonalChangedFiles int `csv:"total_personal_changed_files"`
	TotalPersonalMerged       int `csv:"total_personal_merged"`
	TotalPersonalClosed       int `csv:"total_personal_closed"`
	TotalPersonalApproved     int `csv:"total_personal_approved"`

	TotalReviewedCommits      int `csv:"total_reviewed_commits"`
	TotalReviewedAdditions    int `csv:"total_reviewed_additions"`
	TotalReviewedDeletions    int `csv:"total_reviewed_deletions"`
	TotalReviewedChangedFiles int `csv:"total_reviewed_changed_files"`
	TotalReviewedMerged       int `csv:"total_reviewed_merged"`
	TotalReviewedClosed       int `csv:"total_reviewed_closed"`
	TotalReviewedApproved     int `csv:"total_reviewed_approved"`

	seen map[int64]bool `csv:"-"`
}

func (r *CompanyMetrics) Add(pr *git.PullRequest) {
	prCreator := pr.IsOwner(r.Logon)
	prReviewer := pr.IsReviewer(r.Logon)

	if r.seen == nil {
		r.seen = make(map[int64]bool)
	}

	if r.seen[pr.PullRequest.GetID()] {
		return
	}

	r.seen[pr.PullRequest.GetID()] = true

	if prCreator {
		r.CreatedPRs += 1

		r.TotalPersonalCommits += pr.PullRequest.GetCommits()
		r.TotalPersonalAdditions += pr.PullRequest.GetAdditions()
		r.TotalPersonalDeletions += pr.PullRequest.GetDeletions()
		r.TotalPersonalChangedFiles += pr.PullRequest.GetChangedFiles()

		if pr.PullRequest.GetMerged() {
			r.TotalPersonalMerged += 1
		}
		if !pr.PullRequest.GetMerged() && pr.PullRequest.ClosedAt != nil {
			r.TotalPersonalClosed += 1
		}

		if pr.Approved() {
			r.TotalPersonalApproved += 1
		}
	}

	if !prCreator && prReviewer {
		r.ReviewedPrs += 1

		r.TotalReviewedCommits += pr.PullRequest.GetCommits()
		r.TotalReviewedAdditions += pr.PullRequest.GetAdditions()
		r.TotalReviewedDeletions += pr.PullRequest.GetDeletions()
		r.TotalReviewedChangedFiles += pr.PullRequest.GetChangedFiles()

		if pr.PullRequest.GetMerged() {
			r.TotalReviewedMerged += 1
		}
		if !pr.PullRequest.GetMerged() && pr.PullRequest.ClosedAt != nil {
			r.TotalReviewedClosed += 1
		}

		if pr.ApprovedBy(r.Logon) {
			r.TotalReviewedApproved += 1
		}
	}
}
