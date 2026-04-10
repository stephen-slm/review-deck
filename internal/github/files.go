package github

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

// restPRFile is the JSON shape returned by the GitHub REST API for a single
// file in a pull request (GET /repos/{owner}/{repo}/pulls/{number}/files).
type restPRFile struct {
	SHA              string `json:"sha"`
	Filename         string `json:"filename"`
	Status           string `json:"status"`
	Additions        int    `json:"additions"`
	Deletions        int    `json:"deletions"`
	Changes          int    `json:"changes"`
	Patch            string `json:"patch"`
	PreviousFilename string `json:"previous_filename"`
}

// GetPRFiles fetches the list of changed files (with unified diff patches)
// for a pull request using the GitHub REST API.
//
// The GraphQL API does not expose per-file patches, so we use REST here.
// Pagination is handled automatically (up to 3000 files / 30 pages).
func (c *Client) GetPRFiles(ctx context.Context, owner, repo string, number int) ([]PRFile, error) {
	httpClient := c.HTTPClient()

	var allFiles []PRFile
	page := 1

	for {
		url := fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls/%d/files?per_page=100&page=%d", owner, repo, number, page)

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Accept", "application/vnd.github.v3+json")

		resp, err := httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("fetch PR files: %w", err)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
		}

		if err != nil {
			return nil, fmt.Errorf("read response body: %w", err)
		}

		var restFiles []restPRFile
		if err := json.Unmarshal(body, &restFiles); err != nil {
			return nil, fmt.Errorf("decode PR files: %w", err)
		}

		for _, rf := range restFiles {
			allFiles = append(allFiles, PRFile{
				Filename:         rf.Filename,
				Status:           rf.Status,
				Additions:        rf.Additions,
				Deletions:        rf.Deletions,
				Changes:          rf.Changes,
				Patch:            rf.Patch,
				PreviousFilename: rf.PreviousFilename,
			})
		}

		// If we got fewer than 100 results, we've reached the last page.
		if len(restFiles) < 100 {
			break
		}

		page++
		// Safety cap: GitHub limits to 3000 files max.
		if page > 30 {
			break
		}
	}

	return allFiles, nil
}

// GetFileContent fetches the raw content of a file at a specific git ref
// using the GitHub Contents API. Returns the decoded file content as a string.
func (c *Client) GetFileContent(ctx context.Context, owner, repo, path, ref string) (string, error) {
	httpClient := c.HTTPClient()

	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s?ref=%s",
		owner, repo, path, url.QueryEscape(ref))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	// Request raw content directly (no base64 JSON wrapper).
	req.Header.Set("Accept", "application/vnd.github.v3.raw")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch file content: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
	}

	return string(body), nil
}

// CompareCommits returns the list of files changed between two commits using
// the GitHub compare API. Used for "diff since last review" filtering.
func (c *Client) CompareCommits(ctx context.Context, owner, repo, base, head string) ([]PRFile, error) {
	httpClient := c.HTTPClient()

	var allFiles []PRFile
	page := 1

	for {
		apiURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/compare/%s...%s?per_page=100&page=%d",
			owner, repo, base, head, page)

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
		if err != nil {
			return nil, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Accept", "application/vnd.github.v3+json")

		resp, err := httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("compare commits: %w", err)
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("GitHub API returned %d: %s", resp.StatusCode, string(body))
		}

		if err != nil {
			return nil, fmt.Errorf("read response body: %w", err)
		}

		var result struct {
			Files []restPRFile `json:"files"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("decode compare: %w", err)
		}

		for _, rf := range result.Files {
			allFiles = append(allFiles, PRFile{
				Filename:         rf.Filename,
				Status:           rf.Status,
				Additions:        rf.Additions,
				Deletions:        rf.Deletions,
				Changes:          rf.Changes,
				Patch:            rf.Patch,
				PreviousFilename: rf.PreviousFilename,
			})
		}

		if len(result.Files) < 100 {
			break
		}
		page++
		if page > 30 {
			break
		}
	}

	return allFiles, nil
}
