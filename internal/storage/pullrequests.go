package storage

import (
	"encoding/json"
	"fmt"
	"time"

	gh "review-deck/internal/github"
)

// UpsertPullRequest stores or updates a pull request and its related data.
func (db *DB) UpsertPullRequest(pr gh.PullRequest) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO pull_requests (
			node_id, number, repo_owner, repo_name, title, state, author_login, author_avatar,
			is_draft, is_in_merge_queue, additions, deletions, changed_files, commits_count,
			mergeable, review_decision, head_ref, base_ref, url, body, checks_status, merged_by,
			created_at, updated_at, merged_at, closed_at, last_synced_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(node_id) DO UPDATE SET
			title=excluded.title, state=excluded.state, is_draft=excluded.is_draft,
			is_in_merge_queue=excluded.is_in_merge_queue,
			additions=excluded.additions, deletions=excluded.deletions, changed_files=excluded.changed_files,
			commits_count=excluded.commits_count, mergeable=excluded.mergeable,
			review_decision=excluded.review_decision, checks_status=excluded.checks_status,
			merged_by=excluded.merged_by, updated_at=excluded.updated_at,
			merged_at=excluded.merged_at, closed_at=excluded.closed_at,
			last_synced_at=excluded.last_synced_at`,
		pr.NodeID, pr.Number, pr.RepoOwner, pr.RepoName, pr.Title, pr.State,
		pr.Author, pr.AuthorAvatar, pr.IsDraft, pr.IsInMergeQueue,
		pr.Additions, pr.Deletions, pr.ChangedFiles, pr.CommitCount,
		pr.Mergeable, pr.ReviewDecision, pr.HeadRef, pr.BaseRef, pr.URL, pr.Body,
		pr.ChecksStatus, pr.MergedBy,
		pr.CreatedAt, pr.UpdatedAt, pr.MergedAt, pr.ClosedAt, time.Now().UTC(),
	)
	if err != nil {
		return fmt.Errorf("upsert pull request: %w", err)
	}

	// Replace reviews.
	if _, err := tx.Exec("DELETE FROM reviews WHERE pr_node_id = ?", pr.NodeID); err != nil {
		return fmt.Errorf("delete old reviews: %w", err)
	}
	for _, r := range pr.Reviews {
		_, err := tx.Exec(
			"INSERT INTO reviews (id, pr_node_id, author_login, author_avatar, state, body, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			r.ID, pr.NodeID, r.Author, r.AuthorAvatar, r.State, r.Body, r.SubmittedAt,
		)
		if err != nil {
			return fmt.Errorf("insert review: %w", err)
		}
	}

	// Replace review requests.
	if _, err := tx.Exec("DELETE FROM review_requests WHERE pr_node_id = ?", pr.NodeID); err != nil {
		return fmt.Errorf("delete old review requests: %w", err)
	}
	for _, rr := range pr.ReviewRequests {
		_, err := tx.Exec(
			"INSERT INTO review_requests (pr_node_id, reviewer, reviewer_type) VALUES (?, ?, ?)",
			pr.NodeID, rr.Reviewer, rr.ReviewerType,
		)
		if err != nil {
			return fmt.Errorf("insert review request: %w", err)
		}
	}

	return tx.Commit()
}

// UpsertPullRequests stores multiple pull requests.
func (db *DB) UpsertPullRequests(prs []gh.PullRequest) error {
	for _, pr := range prs {
		if err := db.UpsertPullRequest(pr); err != nil {
			return err
		}
	}
	return nil
}

// GetPullRequests returns cached pull requests as JSON (for the frontend).
func (db *DB) GetPullRequests(authorLogin string, state string) ([]gh.PullRequest, error) {
	query := "SELECT node_id, number, repo_owner, repo_name, title, state, author_login, author_avatar, is_draft, is_in_merge_queue, additions, deletions, changed_files, commits_count, mergeable, review_decision, head_ref, base_ref, url, body, checks_status, merged_by, created_at, updated_at, merged_at, closed_at FROM pull_requests WHERE 1=1"
	var args []interface{}

	if authorLogin != "" {
		query += " AND author_login = ?"
		args = append(args, authorLogin)
	}
	if state != "" {
		query += " AND state = ?"
		args = append(args, state)
	}
	query += " ORDER BY updated_at DESC"

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("query pull requests: %w", err)
	}
	defer rows.Close()

	var prs []gh.PullRequest
	for rows.Next() {
		var pr gh.PullRequest
		err := rows.Scan(
			&pr.NodeID, &pr.Number, &pr.RepoOwner, &pr.RepoName, &pr.Title, &pr.State,
			&pr.Author, &pr.AuthorAvatar, &pr.IsDraft, &pr.IsInMergeQueue,
			&pr.Additions, &pr.Deletions, &pr.ChangedFiles, &pr.CommitCount,
			&pr.Mergeable, &pr.ReviewDecision, &pr.HeadRef, &pr.BaseRef, &pr.URL, &pr.Body,
			&pr.ChecksStatus, &pr.MergedBy,
			&pr.CreatedAt, &pr.UpdatedAt, &pr.MergedAt, &pr.ClosedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan pull request: %w", err)
		}
		prs = append(prs, pr)
	}
	return prs, rows.Err()
}

// GetPullRequestJSON returns a pull request with all relations as JSON bytes.
func (db *DB) GetPullRequestJSON(nodeID string) ([]byte, error) {
	prs, err := db.GetPullRequests("", "")
	if err != nil {
		return nil, err
	}
	for _, pr := range prs {
		if pr.NodeID == nodeID {
			return json.Marshal(pr)
		}
	}
	return nil, fmt.Errorf("pull request not found: %s", nodeID)
}
