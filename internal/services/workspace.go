package services

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
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

// defaultTourPrompt is the system prompt for generating code tours.
const defaultTourPrompt = `You are generating a code tour of a pull request for an engineer who already reads code. Be dense. Explain what the diff does NOT already show: why this change, what invariant it preserves, what it replaces, what non-obvious constraint it satisfies.

Output ONLY a JSON object (no markdown fences, no preamble) with this exact structure:
{
  "title": "Short title (under 60 chars, imperative mood)",
  "summary": "2-3 sentences: what changed and why. No preamble.",
  "steps": [
    {
      "title": "Terse step title",
      "description": "Markdown body.",
      "file": "path/to/file.go",
      "startLine": 10,
      "endLine": 25,
      "changeType": "added"
    }
  ]
}

Step count is a HARD CAP scaled to diff size:
- Under 200 changed lines: 1-3 steps.
- 200-1000 changed lines: 3-6 steps.
- Over 1000 changed lines: 6-10 steps. Never more than 10.

Step rules:
- Description: under 60 words. Bullet-first when listing things. No "In this step...", no "Let's look at...", no colleague-walking-through-code voice.
- Title: symbol name, subsystem, or action verb phrase ("Add retry backoff", not "We introduce a retry mechanism").
- One step per meaningful change. Do NOT split a large single-purpose change into multiple steps just because it spans many lines — a 200-line range is fine if it is one logical unit.
- Skip trivial changes (renames, formatting, import reshuffles) unless they matter.
- Order steps by importance, not file order.
- changeType must be one of: "added", "modified", "removed", "context".
- A step may use file="" and omit line numbers if it describes cross-cutting structure, but prefer concrete file+line steps.
- Output ONLY valid JSON — no trailing commas, no comments.`

// defaultSummaryPrompt is the system prompt for generating PR summaries.
const defaultSummaryPrompt = `You are a senior software engineer. Based on the pull request diff, write a brief TL;DR summary in 2-3 sentences. Focus on WHAT changed and WHY. Be specific — mention key files, functions, or features affected. Output ONLY the summary text, no headings or formatting.`

// defaultTitlePrompt is the system prompt for generating PR titles.
const defaultTitlePrompt = `You are a senior software engineer writing a pull request title. Based on the diff provided, generate a single concise PR title that summarizes the changes.

Rules:
- Output ONLY the title text — no quotes, no prefix, no preamble, no explanation.
- Keep it under 72 characters.
- Use imperative mood (e.g. "Add user authentication" not "Added user authentication").
- Be specific about what changed, not vague.
- Do not include ticket/issue numbers — those will be added automatically.`

// streamEvent represents a single line of `claude -p --output-format stream-json --verbose`.
// We only care about "assistant" (text content) and "result" (metadata/errors) events.
type streamEvent struct {
	Type    string `json:"type"`
	Subtype string `json:"subtype"`

	// "assistant" events carry the model's response text.
	Message struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"message"`

	// "result" events carry metadata and optional error info.
	IsError    bool    `json:"is_error"`
	Result     string  `json:"result"`
	TotalCost  float64 `json:"total_cost_usd"`
	DurationMs float64 `json:"duration_ms"`
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

// AISummaryResult is the JSON-friendly result returned to the frontend.
type AISummaryResult struct {
	Summary   string  `json:"summary"`
	Cost      float64 `json:"cost"`
	Duration  float64 `json:"duration"`
	CreatedAt string  `json:"created_at"`
}

// CodeTourResult is the JSON-friendly result returned to the frontend.
type CodeTourResult struct {
	Tour      string  `json:"tour"`
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

	// Guards the running code tour goroutine.
	muTour     sync.Mutex
	cancelTour context.CancelFunc

	// Guards the running summary goroutine.
	muSummary     sync.Mutex
	cancelSummary context.CancelFunc
}

// NewWorkspaceService creates a new WorkspaceService.
func NewWorkspaceService(db *storage.DB) *WorkspaceService {
	return &WorkspaceService{db: db}
}

// SetContext sets the Wails app context.
func (s *WorkspaceService) SetContext(ctx context.Context) {
	s.ctx = ctx
}

// ghEnv returns a copy of the current environment with GH_TOKEN set from
// the stored GitHub PAT. This ensures `gh` CLI commands authenticate
// correctly even when the app is launched from Finder/Spotlight where
// `gh auth` may not be configured.
func (s *WorkspaceService) ghEnv() []string {
	env := os.Environ()
	token, err := s.db.GetSetting("github_token")
	if err == nil && token != "" {
		env = append(env, "GH_TOKEN="+token)
	}
	return env
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
		return errors.New("the GitHub CLI (gh) is not installed — install it from https://cli.github.com")
	}

	dirty, err := gitutil.HasUncommittedChanges(repo.LocalPath)
	if err != nil {
		return fmt.Errorf("cannot check working tree: %w", err)
	}
	if dirty {
		return fmt.Errorf("you have uncommitted changes in %s — stash or commit before checking out", repo.LocalPath)
	}

	_, err = gitutil.CheckoutPR(repo.LocalPath, prNumber, s.ghEnv())
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

// getMaxTurns returns the user-configured max turns for Claude CLI (default 20).
func (s *WorkspaceService) getMaxTurns() int {
	val, err := s.db.GetSetting("ai_max_turns")
	if err != nil || strings.TrimSpace(val) == "" {
		return 20
	}
	n, err := strconv.Atoi(strings.TrimSpace(val))
	if err != nil || n < 1 {
		return 20
	}
	return n
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
		return errors.New("app context not set")
	}

	if !gitutil.IsGhInstalled() {
		return errors.New("the GitHub CLI (gh) is not installed — install it from https://cli.github.com")
	}

	if !gitutil.IsClaudeInstalled() {
		return errors.New("the Claude CLI is not installed — install it from https://docs.anthropic.com/en/docs/claude-code/overview")
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
		ghRepo := repoOwner + "/" + repoName
		ghTokenEnv := s.ghEnv()
		diffCmd := exec.CommandContext(ctx, "gh", "pr", "diff", strconv.Itoa(prNumber), "--repo", ghRepo)
		diffCmd.Dir = repo.LocalPath
		diffCmd.Env = ghTokenEnv
		diff, err := diffCmd.Output()
		if err != nil {
			errMsg := fmt.Sprintf("failed to get PR diff: %v", err)
			if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
				errMsg = fmt.Sprintf("failed to get PR diff: %s", strings.TrimSpace(string(exitErr.Stderr)))
			}
			wailsRuntime.EventsEmit(appCtx, "ai:error", map[string]any{"error": errMsg})
			return
		}

		if len(bytes.TrimSpace(diff)) == 0 {
			wailsRuntime.EventsEmit(appCtx, "ai:error", map[string]any{"error": "PR diff is empty"})
			return
		}

		// 2. Run Claude.
		reviewText, cost, durationMs, err := s.runClaude(ctx, repo.LocalPath, diff, prompt, maxCost, "Review this pull request diff:")

		if ctx.Err() == context.DeadlineExceeded {
			wailsRuntime.EventsEmit(appCtx, "ai:error", map[string]any{"error": "Claude review timed out (3 minute limit)"})
			return
		}
		if err != nil {
			wailsRuntime.EventsEmit(appCtx, "ai:error", map[string]any{"error": err.Error()})
			return
		}

		// Save result to DB for caching.
		if prNodeID != "" {
			_ = db.SaveAIReview(prNodeID, repoOwner, repoName, prNumber, reviewText, cost, durationMs)
		}

		now := time.Now().UTC().Format(time.RFC3339)
		wailsRuntime.EventsEmit(appCtx, "ai:result", map[string]any{
			"review":     reviewText,
			"cost":       cost,
			"duration":   durationMs,
			"created_at": now,
		})
	}()

	return nil
}

// extractJSON finds and returns the first valid JSON object in the text.
// It handles markdown code fences, narrative text around JSON, etc.
func extractJSON(text string) string {
	text = strings.TrimSpace(text)

	// Try the full text first.
	if json.Valid([]byte(text)) {
		return text
	}

	// Try stripping markdown code fences.
	if strings.Contains(text, "```") {
		start := strings.Index(text, "```")
		if start >= 0 {
			inner := text[start+3:]
			if nl := strings.Index(inner, "\n"); nl >= 0 {
				inner = inner[nl+1:]
			}
			if end := strings.LastIndex(inner, "```"); end >= 0 {
				inner = strings.TrimSpace(inner[:end])
				if json.Valid([]byte(inner)) {
					return inner
				}
			}
		}
	}

	// Find the outermost { ... } in the text.
	start := strings.Index(text, "{")
	if start >= 0 {
		depth := 0
		inString := false
		escaped := false
		for i := start; i < len(text); i++ {
			ch := text[i]
			if escaped {
				escaped = false
				continue
			}
			if ch == '\\' && inString {
				escaped = true
				continue
			}
			if ch == '"' {
				inString = !inString
				continue
			}
			if inString {
				continue
			}
			if ch == '{' {
				depth++
			} else if ch == '}' {
				depth--
				if depth == 0 {
					candidate := text[start : i+1]
					if json.Valid([]byte(candidate)) {
						return candidate
					}
					break
				}
			}
		}
	}

	return ""
}

// extractStreamError scans stream-json output for a result event with is_error=true
// and returns its error text. Falls back to collecting any non-JSON lines (plain-text
// errors) so callers don't dump raw hook/session JSON to the UI.
func extractStreamError(stdout string) string {
	scanner := bufio.NewScanner(strings.NewReader(stdout))
	scanner.Buffer(make([]byte, 0, 64*1024), 50*1024*1024)
	var plainLines []string
	for scanner.Scan() {
		line := scanner.Text()
		var ev streamEvent
		if json.Unmarshal([]byte(line), &ev) != nil {
			// Not JSON — likely a plain-text error message from Claude CLI.
			if trimmed := strings.TrimSpace(line); trimmed != "" {
				plainLines = append(plainLines, trimmed)
			}
			continue
		}
		if ev.Type == "result" && ev.IsError && ev.Result != "" {
			return ev.Result
		}
	}
	if len(plainLines) > 0 {
		return strings.Join(plainLines, "\n")
	}
	return ""
}

// runClaude executes claude -p with the diff piped to stdin.
func (s *WorkspaceService) runClaude(ctx context.Context, repoDir string, diff []byte, prompt string, maxCost float64, userMessage string) (review string, cost float64, durationMs int, err error) {
	args := []string{"-p",
		"--verbose",
		"--output-format", "stream-json",
		"--max-turns", strconv.Itoa(s.getMaxTurns()),
		"--append-system-prompt", prompt,
	}
	if maxCost > 0 {
		args = append(args, "--max-budget-usd", fmt.Sprintf("%.4f", maxCost))
	}
	args = append(args, userMessage)

	cmd := exec.CommandContext(ctx, "claude", args...)
	cmd.Stdin = bytes.NewReader(diff)
	cmd.Dir = repoDir

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf
	if runErr := cmd.Run(); runErr != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", 0, 0, fmt.Errorf("Claude timed out")
		}
		if ctx.Err() == context.Canceled {
			return "", 0, 0, fmt.Errorf("cancelled")
		}
		errMsg := strings.TrimSpace(stderrBuf.String())
		if errMsg == "" {
			// Try to extract a meaningful error from stream-json output
			// instead of dumping all the raw JSON (which includes hook events).
			errMsg = extractStreamError(stdoutBuf.String())
		}
		if errMsg == "" {
			// Last resort: include exit code + raw output for debugging.
			// Show the LAST 1500 chars (tail) which is where errors appear,
			// after hook events.
			raw := strings.TrimSpace(stdoutBuf.String())
			stderr := strings.TrimSpace(stderrBuf.String())
			if len(raw) > 1500 {
				raw = "..." + raw[len(raw)-1500:]
			}
			if stderr != "" {
				raw = raw + " | stderr: " + stderr
			}
			if raw != "" {
				errMsg = fmt.Sprintf("%v — %s", runErr, raw)
			} else {
				errMsg = fmt.Sprintf("%v (no output from Claude CLI)", runErr)
			}
		}
		return "", 0, 0, fmt.Errorf("%s", errMsg)
	}

	// Parse stream-json: line-delimited JSON with "assistant" and "result" events.
	var textParts []string
	scanner := bufio.NewScanner(&stdoutBuf)
	scanner.Buffer(make([]byte, 0, 64*1024), 50*1024*1024)

	for scanner.Scan() {
		var event streamEvent
		if json.Unmarshal(scanner.Bytes(), &event) != nil {
			continue
		}
		switch event.Type {
		case "assistant":
			for _, block := range event.Message.Content {
				if block.Type == "text" {
					textParts = append(textParts, block.Text)
				}
			}
		case "result":
			if event.IsError {
				errText := event.Result
				if errText == "" {
					errText = "unknown Claude error"
				}
				return "", 0, 0, fmt.Errorf("%s", extractClaudeError(errText))
			}
			cost = event.TotalCost
			durationMs = int(event.DurationMs)
			// Fallback: use result field if populated (future CLI fix).
			if event.Result != "" && len(textParts) == 0 {
				textParts = append(textParts, event.Result)
			}
		}
	}

	return strings.Join(textParts, ""), cost, durationMs, nil
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
		return errors.New("app context not set")
	}

	if !gitutil.IsGhInstalled() {
		return errors.New("the GitHub CLI (gh) is not installed — install it from https://cli.github.com")
	}

	if !gitutil.IsClaudeInstalled() {
		return errors.New("the Claude CLI is not installed — install it from https://docs.anthropic.com/en/docs/claude-code/overview")
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
		ghRepo := repoOwner + "/" + repoName
		ghTokenEnv := s.ghEnv()
		diffCmd := exec.CommandContext(ctx, "gh", "pr", "diff", strconv.Itoa(prNumber), "--repo", ghRepo)
		diffCmd.Dir = repo.LocalPath
		diffCmd.Env = ghTokenEnv
		diff, err := diffCmd.Output()
		if err != nil {
			errMsg := fmt.Sprintf("failed to get PR diff: %v", err)
			if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
				errMsg = fmt.Sprintf("failed to get PR diff: %s", strings.TrimSpace(string(exitErr.Stderr)))
			}
			wailsRuntime.EventsEmit(appCtx, "description:error", map[string]any{"error": errMsg})
			return
		}

		if len(bytes.TrimSpace(diff)) == 0 {
			wailsRuntime.EventsEmit(appCtx, "description:error", map[string]any{"error": "PR diff is empty"})
			return
		}

		// 2. Run Claude with the description prompt.
		descriptionText, cost, durationMs, err := s.runClaude(ctx, repo.LocalPath, diff, prompt, maxCost, "Generate a description for this pull request diff:")

		if ctx.Err() == context.DeadlineExceeded {
			wailsRuntime.EventsEmit(appCtx, "description:error", map[string]any{"error": "Claude description generation timed out (3 minute limit)"})
			return
		}
		if err != nil {
			wailsRuntime.EventsEmit(appCtx, "description:error", map[string]any{"error": err.Error()})
			return
		}

		wailsRuntime.EventsEmit(appCtx, "description:result", map[string]any{
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
		return errors.New("the GitHub CLI (gh) is not installed")
	}

	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	ghRepo := repoOwner + "/" + repoName
	cmd := exec.Command("gh", "pr", "edit", strconv.Itoa(prNumber), "--body", body, "--repo", ghRepo)
	cmd.Dir = repo.LocalPath
	cmd.Env = s.ghEnv()

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
		return errors.New("app context not set")
	}

	if !gitutil.IsGhInstalled() {
		return errors.New("the GitHub CLI (gh) is not installed — install it from https://cli.github.com")
	}

	if !gitutil.IsClaudeInstalled() {
		return errors.New("the Claude CLI is not installed — install it from https://docs.anthropic.com/en/docs/claude-code/overview")
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
		ghRepo := repoOwner + "/" + repoName
		ghTokenEnv := s.ghEnv()
		diffCmd := exec.CommandContext(ctx, "gh", "pr", "diff", strconv.Itoa(prNumber), "--repo", ghRepo)
		diffCmd.Dir = repo.LocalPath
		diffCmd.Env = ghTokenEnv
		diff, err := diffCmd.Output()
		if err != nil {
			errMsg := fmt.Sprintf("failed to get PR diff: %v", err)
			if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
				errMsg = fmt.Sprintf("failed to get PR diff: %s", strings.TrimSpace(string(exitErr.Stderr)))
			}
			wailsRuntime.EventsEmit(appCtx, "title:error", map[string]any{"error": errMsg})
			return
		}

		if len(bytes.TrimSpace(diff)) == 0 {
			wailsRuntime.EventsEmit(appCtx, "title:error", map[string]any{"error": "PR diff is empty"})
			return
		}

		// 2. Run Claude with the title prompt.
		titleText, _, _, err := s.runClaude(ctx, repo.LocalPath, diff, prompt, maxCost, "Generate a short concise title for this pull request diff:")

		if ctx.Err() == context.DeadlineExceeded {
			wailsRuntime.EventsEmit(appCtx, "title:error", map[string]any{"error": "Claude title generation timed out (3 minute limit)"})
			return
		}
		if err != nil {
			wailsRuntime.EventsEmit(appCtx, "title:error", map[string]any{"error": err.Error()})
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

		wailsRuntime.EventsEmit(appCtx, "title:result", map[string]any{
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
		return errors.New("the GitHub CLI (gh) is not installed")
	}

	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	ghRepo := repoOwner + "/" + repoName
	cmd := exec.Command("gh", "pr", "edit", strconv.Itoa(prNumber), "--title", title, "--repo", ghRepo)
	cmd.Dir = repo.LocalPath
	cmd.Env = s.ghEnv()

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

// ---------- AI Code Tour ----------

// GetCodeTour returns a cached code tour for a PR (if it exists and is <7 days old).
func (s *WorkspaceService) GetCodeTour(prNodeID string) (*CodeTourResult, error) {
	ct, err := s.db.GetCodeTour(prNodeID)
	if err != nil {
		return nil, err
	}
	if ct == nil {
		return nil, nil
	}
	return &CodeTourResult{
		Tour:      ct.Tour,
		Cost:      ct.Cost,
		Duration:  float64(ct.DurationMs) / 1000.0,
		CreatedAt: ct.CreatedAt.Format(time.RFC3339),
	}, nil
}

// DeleteCodeTour removes a cached code tour for a PR.
func (s *WorkspaceService) DeleteCodeTour(prNodeID string) error {
	return s.db.DeleteCodeTour(prNodeID)
}

// StartCodeTour kicks off an async Claude code tour generation for a PR.
// It emits Wails events: "tour:started", "tour:result", "tour:error".
func (s *WorkspaceService) StartCodeTour(repoOwner, repoName string, prNumber int, prNodeID string) error {
	if s.ctx == nil {
		return errors.New("app context not set")
	}

	if !gitutil.IsGhInstalled() {
		return errors.New("the GitHub CLI (gh) is not installed — install it from https://cli.github.com")
	}

	if !gitutil.IsClaudeInstalled() {
		return errors.New("the Claude CLI is not installed — install it from https://docs.anthropic.com/en/docs/claude-code/overview")
	}

	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	maxCost := s.getMaxCost()

	// Cancel any existing tour.
	s.muTour.Lock()
	if s.cancelTour != nil {
		s.cancelTour()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Minute)
	s.cancelTour = cancel
	s.muTour.Unlock()

	appCtx := s.ctx
	db := s.db

	go func() {
		defer cancel()
		wailsRuntime.EventsEmit(appCtx, "tour:started", prNumber)

		// 1. Get the PR diff via `gh pr diff`.
		ghRepo := repoOwner + "/" + repoName
		ghTokenEnv := s.ghEnv()
		diffCmd := exec.CommandContext(ctx, "gh", "pr", "diff", strconv.Itoa(prNumber), "--repo", ghRepo)
		diffCmd.Dir = repo.LocalPath
		diffCmd.Env = ghTokenEnv
		diff, err := diffCmd.Output()
		if err != nil {
			errMsg := fmt.Sprintf("failed to get PR diff: %v", err)
			if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
				errMsg = fmt.Sprintf("failed to get PR diff: %s", strings.TrimSpace(string(exitErr.Stderr)))
			}
			wailsRuntime.EventsEmit(appCtx, "tour:error", map[string]any{"error": errMsg})
			return
		}

		if len(bytes.TrimSpace(diff)) == 0 {
			wailsRuntime.EventsEmit(appCtx, "tour:error", map[string]any{"error": "PR diff is empty"})
			return
		}

		// 2. Run Claude with the tour prompt.
		tourText, cost, durationMs, err := s.runClaude(ctx, repo.LocalPath, diff, defaultTourPrompt, maxCost, "Generate a guided code tour for this pull request diff:")

		if ctx.Err() != nil {
			if ctx.Err() == context.DeadlineExceeded {
				wailsRuntime.EventsEmit(appCtx, "tour:error", map[string]any{"error": "Claude code tour timed out (8 minute limit)"})
			}
			// If cancelled, silently stop — user initiated.
			return
		}
		if err != nil {
			wailsRuntime.EventsEmit(appCtx, "tour:error", map[string]any{"error": err.Error()})
			return
		}

		// 3. Extract JSON from the response.
		tourText = extractJSON(tourText)
		if tourText == "" {
			wailsRuntime.EventsEmit(appCtx, "tour:error", map[string]any{"error": "Claude returned invalid JSON for the code tour"})
			return
		}

		// Save result to DB for caching.
		if prNodeID != "" {
			_ = db.SaveCodeTour(prNodeID, repoOwner, repoName, prNumber, tourText, cost, durationMs)
		}

		now := time.Now().UTC().Format(time.RFC3339)
		wailsRuntime.EventsEmit(appCtx, "tour:result", map[string]any{
			"tour":       tourText,
			"cost":       cost,
			"duration":   durationMs,
			"created_at": now,
		})
	}()

	return nil
}

// CancelCodeTour cancels a running code tour generation.
func (s *WorkspaceService) CancelCodeTour() {
	s.muTour.Lock()
	defer s.muTour.Unlock()
	if s.cancelTour != nil {
		s.cancelTour()
		s.cancelTour = nil
	}
}

// Tracking markers delimiting the code-tour block inside a PR description.
// A stable pair of HTML comments lets us replace the block on re-runs instead
// of growing the description indefinitely.
const (
	codeTourBlockStart = "<!-- review-deck:code-tour-start -->"
	codeTourBlockEnd   = "<!-- review-deck:code-tour-end -->"
)

// mergeCodeTourIntoBody returns a new PR body with the tour block either
// replacing an existing tracked block or appended to the end.
func mergeCodeTourIntoBody(currentBody, tourMarkdown string) string {
	block := codeTourBlockStart + "\n" + strings.TrimSpace(tourMarkdown) + "\n" + codeTourBlockEnd

	startIdx := strings.Index(currentBody, codeTourBlockStart)
	endIdx := strings.Index(currentBody, codeTourBlockEnd)
	if startIdx != -1 && endIdx != -1 && endIdx > startIdx {
		before := strings.TrimRight(currentBody[:startIdx], " \t\n")
		after := strings.TrimLeft(currentBody[endIdx+len(codeTourBlockEnd):], " \t\n")
		parts := make([]string, 0, 3)
		if before != "" {
			parts = append(parts, before)
		}
		parts = append(parts, block)
		if after != "" {
			parts = append(parts, after)
		}
		return strings.Join(parts, "\n\n")
	}

	trimmed := strings.TrimRight(currentBody, " \t\n")
	if trimmed == "" {
		return block
	}
	return trimmed + "\n\n" + block
}

// AppendCodeTourToDescription adds (or replaces) a code-tour block in the PR
// description using tracking HTML comments, then pushes the updated body back
// to GitHub. Re-running replaces the previous block instead of appending a
// new one.
func (s *WorkspaceService) AppendCodeTourToDescription(repoOwner, repoName string, prNumber int, tourMarkdown string) error {
	if strings.TrimSpace(tourMarkdown) == "" {
		return errors.New("tour markdown is empty")
	}
	if !gitutil.IsGhInstalled() {
		return errors.New("the GitHub CLI (gh) is not installed")
	}

	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	ghRepo := repoOwner + "/" + repoName
	ghEnv := s.ghEnv()

	viewCmd := exec.Command("gh", "pr", "view", strconv.Itoa(prNumber), "--json", "body", "--repo", ghRepo)
	viewCmd.Dir = repo.LocalPath
	viewCmd.Env = ghEnv
	var viewStderr bytes.Buffer
	viewCmd.Stderr = &viewStderr
	viewOut, err := viewCmd.Output()
	if err != nil {
		errMsg := strings.TrimSpace(viewStderr.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		return fmt.Errorf("failed to fetch PR description: %s", errMsg)
	}

	var parsed struct {
		Body string `json:"body"`
	}
	if err := json.Unmarshal(viewOut, &parsed); err != nil {
		return fmt.Errorf("failed to parse PR description: %w", err)
	}

	newBody := mergeCodeTourIntoBody(parsed.Body, tourMarkdown)

	editCmd := exec.Command("gh", "pr", "edit", strconv.Itoa(prNumber), "--body", newBody, "--repo", ghRepo)
	editCmd.Dir = repo.LocalPath
	editCmd.Env = ghEnv
	var editStderr bytes.Buffer
	editCmd.Stderr = &editStderr
	if err := editCmd.Run(); err != nil {
		errMsg := strings.TrimSpace(editStderr.String())
		if errMsg == "" {
			errMsg = err.Error()
		}
		return fmt.Errorf("failed to update PR description: %s", errMsg)
	}

	return nil
}

// ---------- AI PR Summary ----------

// GetAISummary returns a cached AI summary for the given PR, or nil.
func (s *WorkspaceService) GetAISummary(prNodeID string) (*AISummaryResult, error) {
	cached, err := s.db.GetAISummary(prNodeID)
	if err != nil {
		return nil, err
	}
	if cached == nil {
		return nil, nil
	}
	return &AISummaryResult{
		Summary:   cached.Summary,
		Cost:      cached.Cost,
		Duration:  float64(cached.DurationMs) / 1000,
		CreatedAt: cached.CreatedAt.Format(time.RFC3339),
	}, nil
}

// DeleteAISummary removes a cached AI summary for a PR.
func (s *WorkspaceService) DeleteAISummary(prNodeID string) error {
	return s.db.DeleteAISummary(prNodeID)
}

// StartAISummary kicks off an async Claude summary generation for a PR.
// It emits Wails events: "summary:started", "summary:result", "summary:error".
func (s *WorkspaceService) StartAISummary(repoOwner, repoName string, prNumber int, prNodeID string) error {
	if s.ctx == nil {
		return errors.New("app context not set")
	}

	if !gitutil.IsGhInstalled() {
		return errors.New("the GitHub CLI (gh) is not installed")
	}

	if !gitutil.IsClaudeInstalled() {
		return errors.New("the Claude CLI is not installed")
	}

	repo, err := s.db.GetTrackedRepoByOwnerName(repoOwner, repoName)
	if err != nil {
		return fmt.Errorf("repository %s/%s is not tracked locally", repoOwner, repoName)
	}

	maxCost := s.getDescriptionMaxCost()

	// Cancel any existing summary generation.
	s.muSummary.Lock()
	if s.cancelSummary != nil {
		s.cancelSummary()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	s.cancelSummary = cancel
	s.muSummary.Unlock()

	appCtx := s.ctx
	db := s.db

	go func() {
		defer cancel()
		wailsRuntime.EventsEmit(appCtx, "summary:started", prNumber)

		ghRepo := repoOwner + "/" + repoName
		ghTokenEnv := s.ghEnv()
		diffCmd := exec.CommandContext(ctx, "gh", "pr", "diff", strconv.Itoa(prNumber), "--repo", ghRepo)
		diffCmd.Dir = repo.LocalPath
		diffCmd.Env = ghTokenEnv
		diff, err := diffCmd.Output()
		if err != nil {
			errMsg := fmt.Sprintf("failed to get PR diff: %v", err)
			if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
				errMsg = fmt.Sprintf("failed to get PR diff: %s", strings.TrimSpace(string(exitErr.Stderr)))
			}
			wailsRuntime.EventsEmit(appCtx, "summary:error", map[string]any{"error": errMsg})
			return
		}

		if len(bytes.TrimSpace(diff)) == 0 {
			wailsRuntime.EventsEmit(appCtx, "summary:error", map[string]any{"error": "PR diff is empty"})
			return
		}

		summaryText, cost, durationMs, err := s.runClaude(ctx, repo.LocalPath, diff, defaultSummaryPrompt, maxCost, "Write a brief TL;DR summary of this pull request diff:")

		if ctx.Err() == context.DeadlineExceeded {
			wailsRuntime.EventsEmit(appCtx, "summary:error", map[string]any{"error": "Claude summary timed out (2 minute limit)"})
			return
		}
		if err != nil {
			wailsRuntime.EventsEmit(appCtx, "summary:error", map[string]any{"error": err.Error()})
			return
		}

		if prNodeID != "" {
			_ = db.SaveAISummary(prNodeID, repoOwner, repoName, prNumber, summaryText, cost, durationMs)
		}

		now := time.Now().UTC().Format(time.RFC3339)
		wailsRuntime.EventsEmit(appCtx, "summary:result", map[string]any{
			"summary":    summaryText,
			"cost":       cost,
			"duration":   durationMs,
			"created_at": now,
		})
	}()

	return nil
}

// CancelAISummary cancels a running AI summary generation.
func (s *WorkspaceService) CancelAISummary() {
	s.muSummary.Lock()
	defer s.muSummary.Unlock()
	if s.cancelSummary != nil {
		s.cancelSummary()
		s.cancelSummary = nil
	}
}
