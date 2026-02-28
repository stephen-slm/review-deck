package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"review-deck/internal/gitutil"
	"review-deck/internal/storage"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// defaultReviewPrompt is the fallback system prompt when no custom prompt is configured.
const defaultReviewPrompt = `You are a senior code reviewer. Analyze this pull request diff for: bugs, security vulnerabilities, performance issues, and code quality concerns. Be concise and actionable. Structure your response as:

## Summary
1-2 sentence overview of the changes.

## Issues Found
- Bulleted list of problems found (bugs, security, performance). If none, say "No issues found."

## Suggestions
- Bulleted list of improvements or best practices. If none, say "No suggestions."

Keep your response focused and under 500 words.`

// defaultDescriptionPrompt is the system prompt for generating PR descriptions.
const defaultDescriptionPrompt = `You are a senior software engineer writing a pull request description. Based on the diff provided, generate a clear and comprehensive PR description in GitHub-flavored Markdown.

Structure your response as:

## Summary
A clear 1-3 sentence summary of what this PR does and why.

## Changes
- Bulleted list of the key changes made, grouped logically.

## Testing
- Brief notes on how the changes should be tested, or what was tested.

Be concise but thorough. Focus on the "what" and "why", not line-by-line details. Output ONLY the markdown description — no preamble, no wrapping code fences.`

// defaultTitlePrompt is the system prompt for generating PR titles.
const defaultTitlePrompt = `You are a senior software engineer writing a pull request title. Based on the diff provided, generate a single concise PR title that summarizes the changes.

Rules:
- Output ONLY the title text — no quotes, no prefix, no preamble, no explanation.
- Keep it under 72 characters.
- Use imperative mood (e.g. "Add user authentication" not "Added user authentication").
- Be specific about what changed, not vague.
- Do not include ticket/issue numbers — those will be added automatically.`

// claudeResult is the JSON output from `claude -p --output-format json`.
type claudeResult struct {
	Type      string  `json:"type"`
	Subtype   string  `json:"subtype"`
	IsError   bool    `json:"is_error"`
	Result    string  `json:"result"`
	Cost      float64 `json:"total_cost_usd"`
	Duration  int     `json:"duration_ms"`
	SessionID string  `json:"session_id"`
}

// ToolAvailability reports which external tools are installed.
type ToolAvailability struct {
	Gh     bool `json:"gh"`
	Claude bool `json:"claude"`
}

// AIReviewResult is the JSON-friendly result returned to the frontend.
type AIReviewResult struct {
	Review    string  `json:"review"`
	Cost      float64 `json:"cost"`
	Duration  float64 `json:"duration"`
	CreatedAt string  `json:"created_at"`
}

// extractClaudeError pulls a human-readable message from the Claude CLI's
// error result string, which often embeds raw JSON API responses.
func extractClaudeError(raw string) string {
	if idx := strings.Index(raw, "{"); idx >= 0 {
		prefix := strings.TrimSpace(raw[:idx])
		if apiIdx := strings.Index(prefix, "API Error:"); apiIdx >= 0 {
			prefix = strings.TrimSpace(prefix[:apiIdx])
		}
		var wrapper struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal([]byte(raw[idx:]), &wrapper); err == nil && wrapper.Error.Message != "" {
			if prefix != "" {
				return prefix + " " + wrapper.Error.Message
			}
			return wrapper.Error.Message
		}
	}
	if dot := strings.Index(raw, ". "); dot >= 0 && dot < 200 {
		return raw[:dot+1]
	}
	if len(raw) > 200 {
		return raw[:200] + "..."
	}
	return raw
}

// WorkspaceService provides local workspace actions: checkout, terminal, and
// AI code review. It is bound to Wails and callable from the frontend.
type WorkspaceService struct {
	db  *storage.DB
	ctx context.Context // Wails app context

	// Guards the running review goroutine.
	mu           sync.Mutex
	cancelReview context.CancelFunc

	// Guards the running description generation goroutine.
	muDesc            sync.Mutex
	cancelDescription context.CancelFunc

	// Guards the running title generation goroutine.
	muTitle     sync.Mutex
	cancelTitle context.CancelFunc
}

// NewWorkspaceService creates a new WorkspaceService.
func NewWorkspaceService(db *storage.DB) *WorkspaceService {
	return &WorkspaceService{db: db}
}

// SetContext sets the Wails app context.
func (s *WorkspaceService) SetContext(ctx context.Context) {
	s.ctx = ctx
}

// CheckToolAvailability reports which CLI tools (gh, claude) are installed.
func (s *WorkspaceService) CheckToolAvailability() ToolAvailability {
	return ToolAvailability{
		Gh:     gitutil.IsGhInstalled(),
		Claude: gitutil.IsClaudeInstalled(),
	}
}

// GetDefaultReviewPrompt returns the built-in default review prompt.
func (s *WorkspaceService) GetDefaultReviewPrompt() string {
	return defaultReviewPrompt
}

// ---------- Checkout ----------

// CheckoutPR checks out a PR branch in the tracked repo's local clone.
func (s *WorkspaceService) CheckoutPR(repoOwner, repoName string, prNumber int) error {
	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	if !gitutil.IsGhInstalled() {
		return fmt.Errorf("the GitHub CLI (gh) is not installed — install it from https://cli.github.com")
	}

	dirty, err := gitutil.HasUncommittedChanges(repo.LocalPath)
	if err != nil {
		return fmt.Errorf("cannot check working tree: %w", err)
	}
	if dirty {
		return fmt.Errorf("you have uncommitted changes in %s — stash or commit before checking out", repo.LocalPath)
	}

	_, err = gitutil.CheckoutPR(repo.LocalPath, prNumber)
	return err
}

// GetCurrentBranch returns the current branch of a tracked repo.
func (s *WorkspaceService) GetCurrentBranch(repoOwner, repoName string) (string, error) {
	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return "", fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}
	return gitutil.GetCurrentBranch(repo.LocalPath)
}

// ---------- Terminal ----------

// OpenTerminal opens a terminal window at a tracked repo's local path.
func (s *WorkspaceService) OpenTerminal(repoOwner, repoName string) error {
	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}
	return gitutil.OpenTerminal(repo.LocalPath)
}

// ---------- AI Review ----------

// getReviewPrompt returns the user-configured prompt or the default.
func (s *WorkspaceService) getReviewPrompt() string {
	prompt, err := s.db.GetSetting("ai_review_prompt")
	if err != nil || strings.TrimSpace(prompt) == "" {
		return defaultReviewPrompt
	}
	return prompt
}

// getMaxCost returns the user-configured max cost per review in USD (0 = unlimited).
func (s *WorkspaceService) getMaxCost() float64 {
	val, err := s.db.GetSetting("ai_max_cost")
	if err != nil || strings.TrimSpace(val) == "" {
		return 0
	}
	f, err := strconv.ParseFloat(strings.TrimSpace(val), 64)
	if err != nil {
		return 0
	}
	return f
}

// getDescriptionMaxCost returns the user-configured max cost per description generation in USD (0 = unlimited).
func (s *WorkspaceService) getDescriptionMaxCost() float64 {
	val, err := s.db.GetSetting("ai_description_max_cost")
	if err != nil || strings.TrimSpace(val) == "" {
		return 0
	}
	f, err := strconv.ParseFloat(strings.TrimSpace(val), 64)
	if err != nil {
		return 0
	}
	return f
}

// GetAIReview returns a cached AI review for a PR (if it exists and is <7 days old).
func (s *WorkspaceService) GetAIReview(prNodeID string) (*AIReviewResult, error) {
	r, err := s.db.GetAIReview(prNodeID)
	if err != nil {
		return nil, err
	}
	if r == nil {
		return nil, nil
	}
	return &AIReviewResult{
		Review:    r.Review,
		Cost:      r.Cost,
		Duration:  float64(r.DurationMs) / 1000.0,
		CreatedAt: r.CreatedAt.Format(time.RFC3339),
	}, nil
}

// DeleteAIReview removes a cached AI review for a PR.
func (s *WorkspaceService) DeleteAIReview(prNodeID string) error {
	return s.db.DeleteAIReview(prNodeID)
}

// StartAIReview kicks off an async Claude code review for a PR.
// It emits Wails events: "ai:started", "ai:result", "ai:error".
func (s *WorkspaceService) StartAIReview(repoOwner, repoName string, prNumber int, prNodeID string) error {
	if s.ctx == nil {
		return fmt.Errorf("app context not set")
	}

	if !gitutil.IsGhInstalled() {
		return fmt.Errorf("the GitHub CLI (gh) is not installed — install it from https://cli.github.com")
	}

	if !gitutil.IsClaudeInstalled() {
		return fmt.Errorf("the Claude CLI is not installed — install it from https://docs.anthropic.com/en/docs/claude-code/overview")
	}

	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	prompt := s.getReviewPrompt()
	maxCost := s.getMaxCost()

	// Cancel any existing review.
	s.mu.Lock()
	if s.cancelReview != nil {
		s.cancelReview()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	s.cancelReview = cancel
	s.mu.Unlock()

	appCtx := s.ctx
	db := s.db

	go func() {
		defer cancel()
		wailsRuntime.EventsEmit(appCtx, "ai:started", prNumber)

		// 1. Get the PR diff via `gh pr diff`.
		diffCmd := exec.CommandContext(ctx, "gh", "pr", "diff", strconv.Itoa(prNumber))
		diffCmd.Dir = repo.LocalPath
		diff, err := diffCmd.Output()
		if err != nil {
			errMsg := fmt.Sprintf("failed to get PR diff: %v", err)
			if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
				errMsg = fmt.Sprintf("failed to get PR diff: %s", strings.TrimSpace(string(exitErr.Stderr)))
			}
			wailsRuntime.EventsEmit(appCtx, "ai:error", map[string]interface{}{"error": errMsg})
			return
		}

		if len(bytes.TrimSpace(diff)) == 0 {
			wailsRuntime.EventsEmit(appCtx, "ai:error", map[string]interface{}{"error": "PR diff is empty"})
			return
		}

		// 2. Run Claude.
		reviewText, cost, durationMs, err := s.runClaude(ctx, repo.LocalPath, diff, prompt, maxCost)

		if ctx.Err() == context.DeadlineExceeded {
			wailsRuntime.EventsEmit(appCtx, "ai:error", map[string]interface{}{"error": "Claude review timed out (3 minute limit)"})
			return
		}
		if err != nil {
			wailsRuntime.EventsEmit(appCtx, "ai:error", map[string]interface{}{"error": err.Error()})
			return
		}

		// Save result to DB for caching.
		if prNodeID != "" {
			_ = db.SaveAIReview(prNodeID, repoOwner, repoName, prNumber, reviewText, cost, durationMs)
		}

		now := time.Now().UTC().Format(time.RFC3339)
		wailsRuntime.EventsEmit(appCtx, "ai:result", map[string]interface{}{
			"review":     reviewText,
			"cost":       cost,
			"duration":   durationMs,
			"created_at": now,
		})
	}()

	return nil
}

// runClaude executes claude -p with the diff piped to stdin.
func (s *WorkspaceService) runClaude(ctx context.Context, repoDir string, diff []byte, prompt string, maxCost float64) (review string, cost float64, durationMs int, err error) {
	args := []string{"-p",
		"--output-format", "json",
		"--max-turns", "1",
		"--append-system-prompt", prompt,
	}
	if maxCost > 0 {
		args = append(args, "--max-budget-usd", fmt.Sprintf("%.4f", maxCost))
	}
	args = append(args, "Review this pull request diff:")

	cmd := exec.CommandContext(ctx, "claude", args...)
	cmd.Stdin = bytes.NewReader(diff)
	cmd.Dir = repoDir

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf
	if runErr := cmd.Run(); runErr != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", 0, 0, fmt.Errorf("Claude review timed out (3 minute limit)")
		}
		errMsg := strings.TrimSpace(stderrBuf.String())
		if errMsg == "" {
			errMsg = strings.TrimSpace(stdoutBuf.String())
		}
		if errMsg == "" {
			errMsg = runErr.Error()
		}
		return "", 0, 0, fmt.Errorf("%s", errMsg)
	}

	out := stdoutBuf.Bytes()
	var result claudeResult
	if jsonErr := json.Unmarshal(out, &result); jsonErr != nil {
		// Non-JSON output — return raw text.
		return strings.TrimSpace(string(out)), 0, 0, nil
	}

	if result.IsError {
		return "", 0, 0, fmt.Errorf("%s", extractClaudeError(result.Result))
	}

	return result.Result, result.Cost, result.Duration, nil
}

// CancelAIReview cancels a running AI review.
func (s *WorkspaceService) CancelAIReview() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancelReview != nil {
		s.cancelReview()
		s.cancelReview = nil
	}
}

// ---------- AI PR Description Generation ----------

// GetDefaultDescriptionPrompt returns the built-in default description prompt.
func (s *WorkspaceService) GetDefaultDescriptionPrompt() string {
	return defaultDescriptionPrompt
}

// getDescriptionPrompt returns the user-configured description prompt or the default.
func (s *WorkspaceService) getDescriptionPrompt() string {
	prompt, err := s.db.GetSetting("ai_description_prompt")
	if err != nil || strings.TrimSpace(prompt) == "" {
		return defaultDescriptionPrompt
	}
	return prompt
}

// StartGenerateDescription kicks off an async Claude description generation for a PR.
// It emits Wails events: "description:started", "description:result", "description:error".
func (s *WorkspaceService) StartGenerateDescription(repoOwner, repoName string, prNumber int) error {
	if s.ctx == nil {
		return fmt.Errorf("app context not set")
	}

	if !gitutil.IsGhInstalled() {
		return fmt.Errorf("the GitHub CLI (gh) is not installed — install it from https://cli.github.com")
	}

	if !gitutil.IsClaudeInstalled() {
		return fmt.Errorf("the Claude CLI is not installed — install it from https://docs.anthropic.com/en/docs/claude-code/overview")
	}

	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	prompt := s.getDescriptionPrompt()
	maxCost := s.getDescriptionMaxCost()

	// Cancel any existing description generation.
	s.muDesc.Lock()
	if s.cancelDescription != nil {
		s.cancelDescription()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	s.cancelDescription = cancel
	s.muDesc.Unlock()

	appCtx := s.ctx

	go func() {
		defer cancel()
		wailsRuntime.EventsEmit(appCtx, "description:started", prNumber)

		// 1. Get the PR diff via `gh pr diff`.
		diffCmd := exec.CommandContext(ctx, "gh", "pr", "diff", strconv.Itoa(prNumber))
		diffCmd.Dir = repo.LocalPath
		diff, err := diffCmd.Output()
		if err != nil {
			errMsg := fmt.Sprintf("failed to get PR diff: %v", err)
			if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
				errMsg = fmt.Sprintf("failed to get PR diff: %s", strings.TrimSpace(string(exitErr.Stderr)))
			}
			wailsRuntime.EventsEmit(appCtx, "description:error", map[string]interface{}{"error": errMsg})
			return
		}

		if len(bytes.TrimSpace(diff)) == 0 {
			wailsRuntime.EventsEmit(appCtx, "description:error", map[string]interface{}{"error": "PR diff is empty"})
			return
		}

		// 2. Run Claude with the description prompt.
		descriptionText, cost, durationMs, err := s.runClaude(ctx, repo.LocalPath, diff, prompt, maxCost)

		if ctx.Err() == context.DeadlineExceeded {
			wailsRuntime.EventsEmit(appCtx, "description:error", map[string]interface{}{"error": "Claude description generation timed out (3 minute limit)"})
			return
		}
		if err != nil {
			wailsRuntime.EventsEmit(appCtx, "description:error", map[string]interface{}{"error": err.Error()})
			return
		}

		wailsRuntime.EventsEmit(appCtx, "description:result", map[string]interface{}{
			"description": descriptionText,
			"cost":        cost,
			"duration":    durationMs,
		})
	}()

	return nil
}

// CancelGenerateDescription cancels a running description generation.
func (s *WorkspaceService) CancelGenerateDescription() {
	s.muDesc.Lock()
	defer s.muDesc.Unlock()
	if s.cancelDescription != nil {
		s.cancelDescription()
		s.cancelDescription = nil
	}
}

// ApplyPRDescription updates a PR's body on GitHub via `gh pr edit --body`.
func (s *WorkspaceService) ApplyPRDescription(repoOwner, repoName string, prNumber int, body string) error {
	if !gitutil.IsGhInstalled() {
		return fmt.Errorf("the GitHub CLI (gh) is not installed")
	}

	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	cmd := exec.Command("gh", "pr", "edit", strconv.Itoa(prNumber), "--body", body)
	cmd.Dir = repo.LocalPath

	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Run(); err != nil {
		errMsg := strings.TrimSpace(stderrBuf.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		return fmt.Errorf("failed to update PR description: %s", errMsg)
	}

	return nil
}

// ---------- AI PR Title Generation ----------

// ticketPrefixRe matches Jira-style ticket IDs at the start of a branch name
// (e.g. "JIRA-123/add-login" → "JIRA-123").
var ticketPrefixRe = regexp.MustCompile(`^([A-Z][A-Z0-9]+-\d+)`)

// GetDefaultTitlePrompt returns the built-in default title prompt.
func (s *WorkspaceService) GetDefaultTitlePrompt() string {
	return defaultTitlePrompt
}

// getTitlePrompt returns the user-configured title prompt or the default.
func (s *WorkspaceService) getTitlePrompt() string {
	prompt, err := s.db.GetSetting("ai_title_prompt")
	if err != nil || strings.TrimSpace(prompt) == "" {
		return defaultTitlePrompt
	}
	return prompt
}

// StartGenerateTitle kicks off an async Claude title generation for a PR.
// It emits Wails events: "title:started", "title:result", "title:error".
func (s *WorkspaceService) StartGenerateTitle(repoOwner, repoName string, prNumber int, branchName string) error {
	if s.ctx == nil {
		return fmt.Errorf("app context not set")
	}

	if !gitutil.IsGhInstalled() {
		return fmt.Errorf("the GitHub CLI (gh) is not installed — install it from https://cli.github.com")
	}

	if !gitutil.IsClaudeInstalled() {
		return fmt.Errorf("the Claude CLI is not installed — install it from https://docs.anthropic.com/en/docs/claude-code/overview")
	}

	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	prompt := s.getTitlePrompt()
	maxCost := s.getDescriptionMaxCost() // reuse description max cost for title generation

	// Cancel any existing title generation.
	s.muTitle.Lock()
	if s.cancelTitle != nil {
		s.cancelTitle()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	s.cancelTitle = cancel
	s.muTitle.Unlock()

	appCtx := s.ctx

	go func() {
		defer cancel()
		wailsRuntime.EventsEmit(appCtx, "title:started", prNumber)

		// 1. Get the PR diff via `gh pr diff`.
		diffCmd := exec.CommandContext(ctx, "gh", "pr", "diff", strconv.Itoa(prNumber))
		diffCmd.Dir = repo.LocalPath
		diff, err := diffCmd.Output()
		if err != nil {
			errMsg := fmt.Sprintf("failed to get PR diff: %v", err)
			if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
				errMsg = fmt.Sprintf("failed to get PR diff: %s", strings.TrimSpace(string(exitErr.Stderr)))
			}
			wailsRuntime.EventsEmit(appCtx, "title:error", map[string]interface{}{"error": errMsg})
			return
		}

		if len(bytes.TrimSpace(diff)) == 0 {
			wailsRuntime.EventsEmit(appCtx, "title:error", map[string]interface{}{"error": "PR diff is empty"})
			return
		}

		// 2. Run Claude with the title prompt.
		titleText, _, _, err := s.runClaude(ctx, repo.LocalPath, diff, prompt, maxCost)

		if ctx.Err() == context.DeadlineExceeded {
			wailsRuntime.EventsEmit(appCtx, "title:error", map[string]interface{}{"error": "Claude title generation timed out (3 minute limit)"})
			return
		}
		if err != nil {
			wailsRuntime.EventsEmit(appCtx, "title:error", map[string]interface{}{"error": err.Error()})
			return
		}

		// Clean up the title — remove surrounding quotes, trim whitespace.
		titleText = strings.TrimSpace(titleText)
		titleText = strings.Trim(titleText, "\"'`")
		titleText = strings.TrimSpace(titleText)

		// 3. Extract ticket prefix from branch name and prepend if found.
		if match := ticketPrefixRe.FindString(branchName); match != "" {
			titleText = match + ": " + titleText
		}

		wailsRuntime.EventsEmit(appCtx, "title:result", map[string]interface{}{
			"title": titleText,
		})
	}()

	return nil
}

// CancelGenerateTitle cancels a running title generation.
func (s *WorkspaceService) CancelGenerateTitle() {
	s.muTitle.Lock()
	defer s.muTitle.Unlock()
	if s.cancelTitle != nil {
		s.cancelTitle()
		s.cancelTitle = nil
	}
}

// ApplyPRTitle updates a PR's title on GitHub via `gh pr edit --title`.
func (s *WorkspaceService) ApplyPRTitle(repoOwner, repoName string, prNumber int, title string) error {
	if !gitutil.IsGhInstalled() {
		return fmt.Errorf("the GitHub CLI (gh) is not installed")
	}

	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	cmd := exec.Command("gh", "pr", "edit", strconv.Itoa(prNumber), "--title", title)
	cmd.Dir = repo.LocalPath

	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Run(); err != nil {
		errMsg := strings.TrimSpace(stderrBuf.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		return fmt.Errorf("failed to update PR title: %s", errMsg)
	}

	return nil
}
