package services

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	gh "review-deck/internal/github"
	"review-deck/internal/storage"
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
	NodeID  string `json:"nodeId"` // GraphQL node ID — used by the frontend to link to the PR detail page
	URL     string `json:"url"`
	Author  string `json:"author"`
	Message string `json:"message"` // Human-readable summary
}

// PollResult contains the data from a single poll cycle, sent to the frontend.
type PollResult struct {
	MyPRs              []gh.PullRequest `json:"myPRs"`
	ReviewRequests     []gh.PullRequest `json:"reviewRequests"`
	TeamReviewRequests []gh.PullRequest `json:"teamReviewRequests"`
	ReviewedByMe       []gh.PullRequest `json:"reviewedByMe"`
	RecentMerged       []gh.PullRequest `json:"recentMerged"`
	Error              string           `json:"error,omitempty"`
	Timestamp          time.Time        `json:"timestamp"`
}

// EventEmitter is the function signature for Wails runtime.EventsEmit.
type EventEmitter func(ctx context.Context, eventName string, data ...interface{})

// memberSyncInterval is how often the poller refreshes the org members cache.
const memberSyncInterval = 24 * time.Hour

// Poller periodically fetches PR data and emits events to the frontend.
type Poller struct {
	db     *storage.DB
	client *gh.Client

	interval    time.Duration
	emit        EventEmitter
	ctx         context.Context
	viewerLogin string // cached viewer login, cleared on client change
	// lastMemberSyncCheck gates how often we attempt org member syncs.
	lastMemberSyncCheck time.Time

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

// SetClient updates the GitHub client used for polling and clears the cached viewer.
func (p *Poller) SetClient(client *gh.Client) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.client = client
	p.viewerLogin = "" // clear cache on client change

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

// filterBotsEnabled reads the filter_bots setting from the database.
func (p *Poller) filterBotsEnabled() bool {
	val, err := p.db.GetSetting("filter_bots")
	if err != nil {
		return false
	}
	return val == "true"
}

// reviewMaxAgeDays reads the review_max_age_days setting from the database.
// Returns the configured value or 7 as a default.
func (p *Poller) reviewMaxAgeDays() int {
	val, err := p.db.GetSetting("review_max_age_days")
	if err != nil || val == "" {
		return 7
	}
	days, err := strconv.Atoi(val)
	if err != nil || days < 1 {
		return 7
	}
	if days > 90 {
		return 90
	}
	return days
}

// getExcludedRepos returns excluded repos for an org formatted as "org/repo".
func (p *Poller) getExcludedRepos(org string) []string {
	repos, err := p.db.GetExcludedRepos(org)
	if err != nil {
		return nil
	}
	qualified := make([]string, len(repos))
	for i, r := range repos {
		qualified[i] = fmt.Sprintf("%s/%s", org, r)
	}
	return qualified
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

	// Fetch tracked repos instead of orgs.
	repos, err := p.db.GetTrackedRepos()
	if err != nil || len(repos) == 0 {
		return
	}

	// Use cached viewer login; fetch once per client lifetime.
	p.mu.Lock()
	login := p.viewerLogin
	p.mu.Unlock()

	if login == "" {
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
		login = viewer.Login
		p.mu.Lock()
		p.viewerLogin = login
		p.mu.Unlock()
	}

	result := PollResult{Timestamp: time.Now()}

	filterBots := p.filterBotsEnabled()
	reviewSince := time.Now().AddDate(0, 0, -p.reviewMaxAgeDays())
	mergedSince := time.Now().AddDate(0, 0, -14)

	for _, repo := range repos {
		owner := repo.RepoOwner
		name := repo.RepoName

		if prs, err := client.GetMyOpenPRsForRepo(ctx, owner, name, login, filterBots); err == nil {
			result.MyPRs = append(result.MyPRs, prs...)
			_ = p.db.UpsertPullRequests(prs)
		} else if isRateLimited(err) {
			log.Printf("poller: rate limited, stopping this cycle")
			return
		}

		if !sleep(ctx, requestDelay) {
			return
		}

		if prs, err := client.GetReviewRequestsForRepo(ctx, owner, name, login, reviewSince, filterBots); err == nil {
			result.ReviewRequests = append(result.ReviewRequests, prs...)
			_ = p.db.UpsertPullRequests(prs)
		} else if isRateLimited(err) {
			log.Printf("poller: rate limited, stopping this cycle")
			return
		}

		if !sleep(ctx, requestDelay) {
			return
		}

		if prs, err := client.GetReviewedByUserForRepo(ctx, owner, name, login, reviewSince, filterBots); err == nil {
			result.ReviewedByMe = append(result.ReviewedByMe, prs...)
			_ = p.db.UpsertPullRequests(prs)
		} else if isRateLimited(err) {
			log.Printf("poller: rate limited, stopping this cycle")
			return
		}

		if !sleep(ctx, requestDelay) {
			return
		}

		if prs, err := client.GetMyRecentMergedPRsForRepo(ctx, owner, name, login, mergedSince, filterBots); err == nil {
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

	// Fetch team review requests per unique org (these are org-level queries).
	uniqueOrgs := make(map[string]bool)
	for _, repo := range repos {
		uniqueOrgs[repo.RepoOwner] = true
	}
	for org := range uniqueOrgs {
		enabledTeams, err := p.db.GetEnabledTeamSlugs(org)
		if err == nil {
			excludedRepos := p.getExcludedRepos(org)
			for _, team := range enabledTeams {
				if prs, err := client.GetTeamReviewRequests(ctx, org, team, reviewSince, filterBots, excludedRepos); err == nil {
					result.TeamReviewRequests = append(result.TeamReviewRequests, prs...)
					_ = p.db.UpsertPullRequests(prs)
				} else if isRateLimited(err) {
					log.Printf("poller: rate limited, stopping this cycle")
					return
				}

				if !sleep(ctx, requestDelay) {
					return
				}
			}
		}
	}

	// Detect changes vs previous poll and emit notifications.
	p.mu.Lock()
	prev := p.previous
	p.previous = &result
	p.mu.Unlock()

	if prev != nil {
		notifications := diffResults(prev, &result)

		// Filter out review-request notifications for PRs only assigned
		// through disabled teams (the user toggled the team off in settings).
		if disabledTeams, err := p.db.GetDisabledTeamSlugs(); err == nil && len(disabledTeams) > 0 {
			filtered := notifications[:0]
			for _, n := range notifications {
				if n.Type == "new-review-request" {
					if pr := findPRByNodeID(result.ReviewRequests, n.NodeID); pr != nil {
						if isOnlyDisabledTeamRequest(pr, disabledTeams, login) {
							continue
						}
					}
				}
				filtered = append(filtered, n)
			}
			notifications = filtered
		}

		if len(notifications) > 0 {
			emit(ctx, NotificationEvent, notifications)
		}
	}

	emit(ctx, PollerEvent, result)

	// Record a metrics snapshot for the trending dashboard.
	p.recordMetrics(&result)

	// Sync org members cache if stale (daily).
	// Derive unique orgs from tracked repos.
	var orgList []string
	for org := range uniqueOrgs {
		orgList = append(orgList, org)
	}
	if p.shouldSyncMembersNow() {
		p.syncOrgMembersIfNeeded(ctx, client, orgList)
	}
}

// shouldSyncMembersNow ensures member sync runs at most once per memberSyncInterval.
// It also triggers on first run (zero value).
func (p *Poller) shouldSyncMembersNow() bool {
	if p.lastMemberSyncCheck.IsZero() || time.Since(p.lastMemberSyncCheck) >= memberSyncInterval {
		p.lastMemberSyncCheck = time.Now()
		return true
	}
	return false
}

// syncOrgMembersIfNeeded checks each tracked org and refreshes the member
// cache if it is older than memberSyncInterval.
func (p *Poller) syncOrgMembersIfNeeded(ctx context.Context, client *gh.Client, orgs []string) {
	for _, org := range orgs {
		syncedAt, err := p.db.GetOrgMembersSyncedAt(org)
		if err != nil {
			continue
		}

		if !syncedAt.IsZero() && time.Since(syncedAt) < memberSyncInterval {
			continue
		}

		if !sleep(ctx, requestDelay) {
			return
		}

		members, err := client.ListOrgMembers(ctx, org)
		if err != nil {
			if isRateLimited(err) {
				log.Printf("poller: rate limited syncing org members for %s", org)
				return
			}
			log.Printf("poller: sync org members for %s: %v", org, err)
			continue
		}

		if err := p.db.UpsertOrgMembers(org, members); err != nil {
			log.Printf("poller: store org members for %s: %v", org, err)
		} else {
			log.Printf("poller: synced %d members for org %s", len(members), org)
		}
	}
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
				NodeID:  pr.NodeID,
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
					NodeID:  pr.NodeID,
					URL:     pr.URL,
					Message: repo + " has been approved",
				})
			case "CHANGES_REQUESTED":
				notes = append(notes, Notification{
					Type:    "changes-requested",
					Title:   pr.Title,
					Repo:    pr.RepoOwner + "/" + pr.RepoName,
					Number:  pr.Number,
					NodeID:  pr.NodeID,
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
					NodeID:  pr.NodeID,
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
						NodeID:  pr.NodeID,
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
					NodeID:  pr.NodeID,
					URL:     pr.URL,
					Message: pr.RepoName + "#" + itoa(pr.Number) + " has been merged",
				})
			}
		}
	}

	return notes
}

// findPRByNodeID looks up a PR in a slice by its GraphQL node ID.
func findPRByNodeID(prs []gh.PullRequest, nodeID string) *gh.PullRequest {
	for i := range prs {
		if prs[i].NodeID == nodeID {
			return &prs[i]
		}
	}
	return nil
}

// isOnlyDisabledTeamRequest returns true when a PR's review request for the
// viewer exists solely because of a disabled team — i.e. the PR has a team
// review request from a disabled team and the viewer is NOT directly requested
// as a user-type reviewer.
func isOnlyDisabledTeamRequest(pr *gh.PullRequest, disabledTeams map[string]bool, viewerLogin string) bool {
	hasDisabledTeam := false
	hasDirectUserRequest := false
	for _, rr := range pr.ReviewRequests {
		if rr.ReviewerType == "team" && disabledTeams[rr.Reviewer] {
			hasDisabledTeam = true
		}
		if rr.ReviewerType == "user" && strings.EqualFold(rr.Reviewer, viewerLogin) {
			hasDirectUserRequest = true
		}
	}
	return hasDisabledTeam && !hasDirectUserRequest
}

// recordMetrics computes aggregate metrics from a poll result and stores
// a snapshot in the database for the trending dashboard.
func (p *Poller) recordMetrics(result *PollResult) {
	snapshot := storage.MetricsSnapshot{
		RecordedAt:     result.Timestamp,
		OpenPRs:        len(result.MyPRs),
		PendingReviews: len(result.ReviewRequests),
		TeamReviews:    len(result.TeamReviewRequests),
		ReviewedByMe:   len(result.ReviewedByMe),
		Merged14d:      len(result.RecentMerged),
	}

	// Average time-to-merge across recently merged PRs.
	var totalMergeHours float64
	var mergeCount int
	for _, pr := range result.RecentMerged {
		if pr.MergedAt != nil && !pr.MergedAt.IsZero() {
			totalMergeHours += pr.MergedAt.Sub(pr.CreatedAt).Hours()
			mergeCount++
		}
	}
	if mergeCount > 0 {
		snapshot.AvgMergeHours = totalMergeHours / float64(mergeCount)
	}

	// Health indicators from open PRs.
	for _, pr := range result.MyPRs {
		if pr.ChecksStatus == "FAILURE" || pr.ChecksStatus == "ERROR" {
			snapshot.CIFailures++
		}
		if pr.Mergeable == "CONFLICTING" {
			snapshot.Conflicts++
		}
		if pr.ReviewDecision == "CHANGES_REQUESTED" {
			snapshot.ChangesRequested++
		}
		if time.Since(pr.UpdatedAt).Hours() > 7*24 {
			snapshot.StalePRs++
		}
		snapshot.TotalAdditions += pr.Additions
		snapshot.TotalDeletions += pr.Deletions
	}

	if err := p.db.InsertMetricsSnapshot(snapshot); err != nil {
		log.Printf("poller: record metrics: %v", err)
	}

	// Prune old snapshots (keep 90 days).
	if _, err := p.db.PruneMetricsSnapshots(time.Now().AddDate(0, 0, -90)); err != nil {
		log.Printf("poller: prune metrics: %v", err)
	}
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
