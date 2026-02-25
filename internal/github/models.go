package github

import "time"

// User represents a GitHub user.
type User struct {
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatarUrl"`
}

// Label represents a GitHub label.
type Label struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// CheckRun represents a CI/CD check status.
type CheckRun struct {
	Name       string `json:"name"`
	Status     string `json:"status"`
	Conclusion string `json:"conclusion"`
}

// ReviewRequest represents a pending review request.
type ReviewRequest struct {
	Reviewer     string `json:"reviewer"`
	ReviewerType string `json:"reviewerType"` // "user" or "team"
}

// Review represents a completed review on a pull request.
type Review struct {
	ID           string    `json:"id"`
	Author       string    `json:"author"`
	AuthorAvatar string    `json:"authorAvatar"`
	State        string    `json:"state"` // APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED, PENDING
	Body         string    `json:"body"`
	SubmittedAt  time.Time `json:"submittedAt"`
}

// PullRequest represents a GitHub pull request with all relevant details.
type PullRequest struct {
	// Identity
	NodeID string `json:"nodeId"`
	Number int    `json:"number"`
	URL    string `json:"url"`

	// Repository
	RepoOwner string `json:"repoOwner"`
	RepoName  string `json:"repoName"`

	// Content
	Title   string `json:"title"`
	Body    string `json:"body"`
	HeadRef string `json:"headRef"`
	BaseRef string `json:"baseRef"`

	// State
	State          string `json:"state"` // OPEN, CLOSED, MERGED
	IsDraft        bool   `json:"isDraft"`
	Mergeable      string `json:"mergeable"`      // MERGEABLE, CONFLICTING, UNKNOWN
	ReviewDecision string `json:"reviewDecision"` // APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, ""

	// Author
	Author       string `json:"author"`
	AuthorAvatar string `json:"authorAvatar"`

	// Stats
	Additions    int `json:"additions"`
	Deletions    int `json:"deletions"`
	ChangedFiles int `json:"changedFiles"`
	CommitCount  int `json:"commitCount"`

	// Related users
	Assignees      []User          `json:"assignees"`
	ReviewRequests []ReviewRequest `json:"reviewRequests"`
	Reviews        []Review        `json:"reviews"`

	// Metadata
	Labels []Label `json:"labels"`

	// CI/CD
	ChecksStatus string `json:"checksStatus"` // SUCCESS, FAILURE, PENDING, ""

	// Timestamps
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
	MergedAt  *time.Time `json:"mergedAt"`
	ClosedAt  *time.Time `json:"closedAt"`

	// Merge info
	MergedBy string `json:"mergedBy"`
}

// Team represents a GitHub team.
type Team struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// ViewerInfo holds the authenticated user's details.
type ViewerInfo struct {
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatarUrl"`
	Teams     []Team `json:"teams"`
}
