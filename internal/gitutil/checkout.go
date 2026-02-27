package gitutil

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// CheckoutPR runs `gh pr checkout <number>` in the given repo directory.
// Returns the combined stdout/stderr output. Requires `gh` CLI to be installed
// and authenticated.
func CheckoutPR(repoPath string, prNumber int) (string, error) {
	absPath, err := filepath.Abs(repoPath)
	if err != nil {
		return "", fmt.Errorf("resolve path: %w", err)
	}

	cmd := exec.Command("gh", "pr", "checkout", fmt.Sprintf("%d", prNumber))
	cmd.Dir = absPath

	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))
	if err != nil {
		if output != "" {
			return "", fmt.Errorf("%s", output)
		}
		return "", fmt.Errorf("gh pr checkout: %w", err)
	}

	return output, nil
}

// GetCurrentBranch returns the name of the currently checked-out branch.
func GetCurrentBranch(repoPath string) (string, error) {
	absPath, err := filepath.Abs(repoPath)
	if err != nil {
		return "", fmt.Errorf("resolve path: %w", err)
	}

	cmd := exec.Command("git", "-C", absPath, "rev-parse", "--abbrev-ref", "HEAD")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("get current branch: %w", err)
	}

	return strings.TrimSpace(string(out)), nil
}

// HasUncommittedChanges returns true if the working tree has uncommitted changes.
func HasUncommittedChanges(repoPath string) (bool, error) {
	absPath, err := filepath.Abs(repoPath)
	if err != nil {
		return false, fmt.Errorf("resolve path: %w", err)
	}

	cmd := exec.Command("git", "-C", absPath, "status", "--porcelain")
	out, err := cmd.Output()
	if err != nil {
		return false, fmt.Errorf("git status: %w", err)
	}

	return strings.TrimSpace(string(out)) != "", nil
}

// IsGhInstalled returns true if the `gh` CLI is available on the PATH.
func IsGhInstalled() bool {
	_, err := exec.LookPath("gh")
	return err == nil
}

// IsClaudeInstalled returns true if the `claude` CLI is available on the PATH.
func IsClaudeInstalled() bool {
	_, err := exec.LookPath("claude")
	return err == nil
}

// IsCodexInstalled returns true if the `codex` CLI (OpenAI Codex) is available on the PATH.
func IsCodexInstalled() bool {
	_, err := exec.LookPath("codex")
	return err == nil
}
