// Package gitutil provides utilities for interacting with local git repositories.
package gitutil

import (
	"fmt"
	"net/url"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

// RepoInfo contains the parsed owner and repo name from a git remote URL.
type RepoInfo struct {
	Owner     string `json:"owner"`
	Repo      string `json:"repo"`
	RemoteURL string `json:"remoteURL"`
}

// sshPattern matches git@github.com:owner/repo.git (and variants).
var sshPattern = regexp.MustCompile(`^(?:ssh://)?(?:[^@]+@)?([^:/]+)[:/](.+?)(?:\.git)?/?$`)

// GetRemoteInfo runs `git remote get-url origin` in the given directory
// and parses the remote URL to extract the GitHub owner and repo name.
func GetRemoteInfo(repoPath string) (*RepoInfo, error) {
	absPath, err := filepath.Abs(repoPath)
	if err != nil {
		return nil, fmt.Errorf("resolve path: %w", err)
	}

	cmd := exec.Command("git", "-C", absPath, "remote", "get-url", "origin")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("not a git repository or no origin remote: %w", err)
	}

	remoteURL := strings.TrimSpace(string(out))
	if remoteURL == "" {
		return nil, fmt.Errorf("empty remote URL")
	}

	owner, repo, err := parseRemoteURL(remoteURL)
	if err != nil {
		return nil, err
	}

	return &RepoInfo{
		Owner:     owner,
		Repo:      repo,
		RemoteURL: remoteURL,
	}, nil
}

// parseRemoteURL extracts owner/repo from an HTTPS or SSH git remote URL.
// Supports:
//   - https://github.com/owner/repo.git
//   - https://github.com/owner/repo
//   - git@github.com:owner/repo.git
//   - ssh://git@github.com/owner/repo.git
func parseRemoteURL(raw string) (owner, repo string, err error) {
	// Try HTTPS first.
	if strings.HasPrefix(raw, "https://") || strings.HasPrefix(raw, "http://") {
		u, parseErr := url.Parse(raw)
		if parseErr != nil {
			return "", "", fmt.Errorf("parse URL: %w", parseErr)
		}
		return extractFromPath(u.Path)
	}

	// Try SSH pattern.
	matches := sshPattern.FindStringSubmatch(raw)
	if matches != nil {
		// matches[2] is the path part, e.g. "owner/repo" or "owner/repo.git"
		return extractFromPath("/" + matches[2])
	}

	return "", "", fmt.Errorf("unrecognized remote URL format: %s", raw)
}

// extractFromPath parses "/owner/repo.git" or "/owner/repo" into owner and repo.
func extractFromPath(path string) (string, string, error) {
	path = strings.TrimPrefix(path, "/")
	path = strings.TrimSuffix(path, ".git")
	path = strings.TrimSuffix(path, "/")

	parts := strings.SplitN(path, "/", 3)
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("cannot extract owner/repo from path: %s", path)
	}

	return parts[0], parts[1], nil
}

// IsGitRepo returns true if the given path is inside a git repository.
func IsGitRepo(path string) bool {
	cmd := exec.Command("git", "-C", path, "rev-parse", "--git-dir")
	return cmd.Run() == nil
}
