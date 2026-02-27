package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"review-deck/internal/gitutil"
	"review-deck/internal/storage"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// defaultClaudeReviewPrompt is the fallback system prompt when no custom prompt is configured.
const defaultClaudeReviewPrompt = `You are a senior code reviewer. Analyze this pull request diff for: bugs, security vulnerabilities, performance issues, and code quality concerns. Be concise and actionable. Structure your response as:

## Summary
1-2 sentence overview of the changes.

## Issues Found
- Bulleted list of problems found (bugs, security, performance). If none, say "No issues found."

## Suggestions
- Bulleted list of improvements or best practices. If none, say "No suggestions."

Keep your response focused and under 500 words.`

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

// WorkspaceService provides local workspace actions: checkout, terminal, and
// Claude Code review. It is bound to Wails and callable from the frontend.
type WorkspaceService struct {
	db  *storage.DB
	ctx context.Context // Wails app context

	// Guards the running Claude review goroutine.
	mu           sync.Mutex
	cancelReview context.CancelFunc
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

// GetDefaultClaudePrompt returns the built-in default review prompt.
func (s *WorkspaceService) GetDefaultClaudePrompt() string {
	return defaultClaudeReviewPrompt
}

// ---------- Checkout ----------

// CheckoutPR checks out a PR branch in the tracked repo's local clone.
// It validates that the repo is tracked, `gh` is installed, and there are no
// uncommitted changes before running `gh pr checkout`.
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
	if err != nil {
		return err
	}

	return nil
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
// Prefers iTerm2 if available, otherwise falls back to Terminal.app.
func (s *WorkspaceService) OpenTerminal(repoOwner, repoName string) error {
	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	return gitutil.OpenTerminal(repo.LocalPath)
}

// ---------- Claude Review ----------

// getClaudePrompt returns the user-configured prompt or the default.
func (s *WorkspaceService) getClaudePrompt() string {
	prompt, err := s.db.GetSetting("ai_review_prompt")
	if err != nil || strings.TrimSpace(prompt) == "" {
		return defaultClaudeReviewPrompt
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

// StartClaudeReview kicks off an async Claude Code review for a PR.
// It emits Wails events: "claude:started", "claude:result", "claude:error".
func (s *WorkspaceService) StartClaudeReview(repoOwner, repoName string, prNumber int, prNodeID string) error {
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

	prompt := s.getClaudePrompt()
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
		wailsRuntime.EventsEmit(appCtx, "claude:started", prNumber)

		// 1. Get the PR diff via `gh pr diff`.
		diffCmd := exec.CommandContext(ctx, "gh", "pr", "diff", strconv.Itoa(prNumber))
		diffCmd.Dir = repo.LocalPath
		diff, err := diffCmd.Output()
		if err != nil {
			errMsg := fmt.Sprintf("failed to get PR diff: %v", err)
			if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
				errMsg = fmt.Sprintf("failed to get PR diff: %s", strings.TrimSpace(string(exitErr.Stderr)))
			}
			wailsRuntime.EventsEmit(appCtx, "claude:error", map[string]interface{}{"error": errMsg})
			return
		}

		if len(bytes.TrimSpace(diff)) == 0 {
			wailsRuntime.EventsEmit(appCtx, "claude:error", map[string]interface{}{"error": "PR diff is empty"})
			return
		}

		// 2. Build Claude CLI arguments.
		args := []string{"-p",
			"--output-format", "json",
			"--max-turns", "1",
			"--append-system-prompt", prompt,
		}
		if maxCost > 0 {
			args = append(args, "--max-cost", fmt.Sprintf("%.4f", maxCost))
		}
		args = append(args, "Review this pull request diff:")

		claudeCmd := exec.CommandContext(ctx, "claude", args...)
		claudeCmd.Stdin = bytes.NewReader(diff)
		claudeCmd.Dir = repo.LocalPath

		var stdoutBuf, stderrBuf bytes.Buffer
		claudeCmd.Stdout = &stdoutBuf
		claudeCmd.Stderr = &stderrBuf
		err = claudeCmd.Run()
		if ctx.Err() == context.DeadlineExceeded {
			wailsRuntime.EventsEmit(appCtx, "claude:error", map[string]interface{}{"error": "Claude review timed out (3 minute limit)"})
			return
		}
		if err != nil {
			errMsg := strings.TrimSpace(stderrBuf.String())
			if errMsg == "" {
				errMsg = strings.TrimSpace(stdoutBuf.String())
			}
			if errMsg == "" {
				errMsg = err.Error()
			}
			wailsRuntime.EventsEmit(appCtx, "claude:error", map[string]interface{}{"error": errMsg})
			return
		}

		// 3. Parse JSON result.
		out := stdoutBuf.Bytes()
		var result claudeResult
		if jsonErr := json.Unmarshal(out, &result); jsonErr != nil {
			// If JSON parsing fails, treat the raw output as the result.
			reviewText := strings.TrimSpace(string(out))
			// Save to DB even for non-JSON output.
			if prNodeID != "" {
				_ = db.SaveAIReview(prNodeID, repoOwner, repoName, prNumber, reviewText, 0, 0)
			}
			wailsRuntime.EventsEmit(appCtx, "claude:result", map[string]interface{}{
				"review":     reviewText,
				"cost":       0,
				"duration":   0,
				"created_at": time.Now().UTC().Format(time.RFC3339),
			})
			return
		}

		if result.IsError {
			wailsRuntime.EventsEmit(appCtx, "claude:error", map[string]interface{}{"error": result.Result})
			return
		}

		// Save result to DB for caching.
		if prNodeID != "" {
			_ = db.SaveAIReview(prNodeID, repoOwner, repoName, prNumber, result.Result, result.Cost, result.Duration)
		}

		now := time.Now().UTC().Format(time.RFC3339)
		wailsRuntime.EventsEmit(appCtx, "claude:result", map[string]interface{}{
			"review":     result.Result,
			"cost":       result.Cost,
			"duration":   result.Duration,
			"created_at": now,
		})
	}()

	return nil
}

// CancelClaudeReview cancels a running Claude review.
func (s *WorkspaceService) CancelClaudeReview() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancelReview != nil {
		s.cancelReview()
		s.cancelReview = nil
	}
}
