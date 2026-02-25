package services

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	gh "pull-request-reviewing/internal/github"
	"pull-request-reviewing/internal/storage"
)

// Event names emitted to the frontend via Wails.
const (
	PollerEvent       = "poller:update"
	NotificationEvent = "poller:notifications"
)

// requestDelay is the pause between individual GraphQL requests to avoid
// GitHub's secondary rate limits (abuse detection).
const requestDelay = 1500 * time.Millisecond

// Notification represents a single change detected between poll cycles.
type Notification struct {
	Type    string `json:"type"`  // "new-review-request", "pr-merged", "pr-approved", "changes-requested", "ci-failed", "ci-passed", "new-pr"
	Title   string `json:"title"` // PR title
	Repo    string `json:"repo"`  // owner/name
	Number  int    `json:"number"`
	URL     string `json:"url"`
	Author  string `json:"author"`
	Message string `json:"message"` // Human-readable summary
}

// PollResult contains the data from a single poll cycle, sent to the frontend.
type PollResult struct {
	MyPRs          []gh.PullRequest `json:"myPRs"`
	ReviewRequests []gh.PullRequest `json:"reviewRequests"`
	ReviewedByMe   []gh.PullRequest `json:"reviewedByMe"`
	RecentMerged   []gh.PullRequest `json:"recentMerged"`
	Error          string           `json:"error,omitempty"`
	Timestamp      time.Time        `json:"timestamp"`
}

// EventEmitter is the function signature for Wails runtime.EventsEmit.
type EventEmitter func(ctx context.Context, eventName string, data ...interface{})

// Poller periodically fetches PR data and emits events to the frontend.
type Poller struct {
	db     *storage.DB
	client *gh.Client

	interval time.Duration
	emit     EventEmitter
	ctx      context.Context

	mu       sync.Mutex
	cancel   context.CancelFunc
	running  bool
	previous *PollResult // previous poll for diffing
}

// NewPoller creates a new Poller. It reads poll_interval_minutes from the
// database, falling back to the given default if not set.
func NewPoller(db *storage.DB, defaultInterval time.Duration) *Poller {
	interval := defaultInterval
	if val, err := db.GetSetting("poll_interval_minutes"); err == nil && val != "" {
		if mins := parseMinutes(val); mins > 0 {
			interval = time.Duration(mins) * time.Minute
		}
	}
	return &Poller{
		db:       db,
		interval: interval,
	}
}

// parseMinutes parses a string as an integer of minutes.
func parseMinutes(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
	}
	return n
}

// SetInterval updates the poll interval and restarts the loop if running.
func (p *Poller) SetInterval(minutes int) {
	if minutes < 1 {
		minutes = 1
	}
	p.mu.Lock()
	p.interval = time.Duration(minutes) * time.Minute
	wasRunning := p.running
	emit := p.emit
	ctx := p.ctx
	p.mu.Unlock()

	if wasRunning && emit != nil && ctx != nil {
		p.Stop()
		// Re-derive a parent context (the original Wails ctx may still be valid).
		p.Start(ctx, emit)
	}
}

// SetClient updates the GitHub client used for polling.
func (p *Poller) SetClient(client *gh.Client) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.client = client

	if client == nil {
		p.stopLocked()
		p.previous = nil
	}
}

// Start begins the polling loop.
func (p *Poller) Start(ctx context.Context, emit EventEmitter) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.running {
		return
	}

	p.emit = emit
	pollCtx, cancel := context.WithCancel(ctx)
	p.ctx = pollCtx
	p.cancel = cancel
	p.running = true

	go p.loop(pollCtx)
}

// Stop halts the polling loop.
func (p *Poller) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.stopLocked()
}

func (p *Poller) stopLocked() {
	if p.cancel != nil {
		p.cancel()
	}
	p.running = false
}

// IsRunning returns whether the poller is currently active.
func (p *Poller) IsRunning() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.running
}

func (p *Poller) loop(ctx context.Context) {
	// Wait before the first poll to let the frontend's initial fetches finish.
	select {
	case <-ctx.Done():
		return
	case <-time.After(10 * time.Second):
	}

	p.poll(ctx)

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.poll(ctx)
		}
	}
}

func sleep(ctx context.Context, d time.Duration) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(d):
		return true
	}
}

func isRateLimited(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "rate limit") ||
		strings.Contains(msg, "403") ||
		strings.Contains(msg, "abuse")
}

func (p *Poller) poll(ctx context.Context) {
	p.mu.Lock()
	client := p.client
	emit := p.emit
	p.mu.Unlock()

	if client == nil || emit == nil {
		return
	}

	orgs, err := p.db.GetTrackedOrgs()
	if err != nil || len(orgs) == 0 {
		return
	}

	viewer, err := client.GetViewer(ctx)
	if err != nil {
		if isRateLimited(err) {
			log.Printf("poller: rate limited on viewer query, backing off")
			return
		}
		log.Printf("poller: get viewer: %v", err)
		emit(ctx, PollerEvent, PollResult{
			Error:     err.Error(),
			Timestamp: time.Now(),
		})
		return
	}

	result := PollResult{Timestamp: time.Now()}

	for _, org := range orgs {
		if prs, err := client.GetMyOpenPRs(ctx, org, viewer.Login); err == nil {
			result.MyPRs = append(result.MyPRs, prs...)
			_ = p.db.UpsertPullRequests(prs)
		} else if isRateLimited(err) {
			log.Printf("poller: rate limited, stopping this cycle")
			return
		}

		if !sleep(ctx, requestDelay) {
			return
		}

		if prs, err := client.GetReviewRequestsForUser(ctx, org, viewer.Login); err == nil {
			result.ReviewRequests = append(result.ReviewRequests, prs...)
			_ = p.db.UpsertPullRequests(prs)
		} else if isRateLimited(err) {
			log.Printf("poller: rate limited, stopping this cycle")
			return
		}

		if !sleep(ctx, requestDelay) {
			return
		}

		if prs, err := client.GetReviewedByUser(ctx, org, viewer.Login); err == nil {
			result.ReviewedByMe = append(result.ReviewedByMe, prs...)
			_ = p.db.UpsertPullRequests(prs)
		} else if isRateLimited(err) {
			log.Printf("poller: rate limited, stopping this cycle")
			return
		}

		if !sleep(ctx, requestDelay) {
			return
		}

		since := time.Now().AddDate(0, 0, -14)
		if prs, err := client.GetMyRecentMergedPRs(ctx, org, viewer.Login, since); err == nil {
			result.RecentMerged = append(result.RecentMerged, prs...)
			_ = p.db.UpsertPullRequests(prs)
		} else if isRateLimited(err) {
			log.Printf("poller: rate limited, stopping this cycle")
			return
		}

		if !sleep(ctx, requestDelay) {
			return
		}
	}

	// Detect changes vs previous poll and emit notifications.
	p.mu.Lock()
	prev := p.previous
	p.previous = &result
	p.mu.Unlock()

	if prev != nil {
		notifications := diffResults(prev, &result)
		if len(notifications) > 0 {
			emit(ctx, NotificationEvent, notifications)
		}
	}

	emit(ctx, PollerEvent, result)
}

// ---- Change detection ----

// prKey uniquely identifies a PR for diffing.
func prKey(pr gh.PullRequest) string {
	return pr.NodeID
}

// indexPRs builds a lookup map keyed by NodeID.
func indexPRs(prs []gh.PullRequest) map[string]gh.PullRequest {
	m := make(map[string]gh.PullRequest, len(prs))
	for _, pr := range prs {
		m[prKey(pr)] = pr
	}
	return m
}

func diffResults(prev, curr *PollResult) []Notification {
	var notes []Notification

	// --- New review requests (PRs that appeared in reviewRequests) ---
	prevRR := indexPRs(prev.ReviewRequests)
	for _, pr := range curr.ReviewRequests {
		if _, existed := prevRR[prKey(pr)]; !existed {
			notes = append(notes, Notification{
				Type:    "new-review-request",
				Title:   pr.Title,
				Repo:    pr.RepoOwner + "/" + pr.RepoName,
				Number:  pr.Number,
				URL:     pr.URL,
				Author:  pr.Author,
				Message: pr.Author + " requested your review on " + pr.RepoName + "#" + itoa(pr.Number),
			})
		}
	}

	// --- Changes on my PRs (review decision, CI, merged) ---
	prevMyPRs := indexPRs(prev.MyPRs)
	for _, pr := range curr.MyPRs {
		old, existed := prevMyPRs[prKey(pr)]
		if !existed {
			continue // new PR showing up is not noteworthy from poller
		}

		repo := pr.RepoName + "#" + itoa(pr.Number)

		// Review decision changed.
		if old.ReviewDecision != pr.ReviewDecision {
			switch pr.ReviewDecision {
			case "APPROVED":
				notes = append(notes, Notification{
					Type:    "pr-approved",
					Title:   pr.Title,
					Repo:    pr.RepoOwner + "/" + pr.RepoName,
					Number:  pr.Number,
					URL:     pr.URL,
					Message: repo + " has been approved",
				})
			case "CHANGES_REQUESTED":
				notes = append(notes, Notification{
					Type:    "changes-requested",
					Title:   pr.Title,
					Repo:    pr.RepoOwner + "/" + pr.RepoName,
					Number:  pr.Number,
					URL:     pr.URL,
					Message: "Changes requested on " + repo,
				})
			}
		}

		// CI status changed.
		if old.ChecksStatus != pr.ChecksStatus {
			switch pr.ChecksStatus {
			case "FAILURE", "ERROR":
				notes = append(notes, Notification{
					Type:    "ci-failed",
					Title:   pr.Title,
					Repo:    pr.RepoOwner + "/" + pr.RepoName,
					Number:  pr.Number,
					URL:     pr.URL,
					Message: "CI failed on " + repo,
				})
			case "SUCCESS":
				if old.ChecksStatus == "PENDING" || old.ChecksStatus == "FAILURE" || old.ChecksStatus == "ERROR" {
					notes = append(notes, Notification{
						Type:    "ci-passed",
						Title:   pr.Title,
						Repo:    pr.RepoOwner + "/" + pr.RepoName,
						Number:  pr.Number,
						URL:     pr.URL,
						Message: "CI passed on " + repo,
					})
				}
			}
		}
	}

	// --- PRs that were open but are now merged ---
	prevMerged := indexPRs(prev.RecentMerged)
	for _, pr := range curr.RecentMerged {
		if _, existed := prevMerged[prKey(pr)]; !existed {
			// Check it was previously in our open PRs.
			if _, wasOpen := prevMyPRs[prKey(pr)]; wasOpen {
				notes = append(notes, Notification{
					Type:    "pr-merged",
					Title:   pr.Title,
					Repo:    pr.RepoOwner + "/" + pr.RepoName,
					Number:  pr.Number,
					URL:     pr.URL,
					Message: pr.RepoName + "#" + itoa(pr.Number) + " has been merged",
				})
			}
		}
	}

	return notes
}

// itoa converts an int to a string without importing strconv.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
