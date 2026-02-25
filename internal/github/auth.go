package github

import (
	"context"

	"github.com/shurcooL/githubv4"
)

// GetViewer returns information about the authenticated user.
func (c *Client) GetViewer(ctx context.Context) (*ViewerInfo, error) {
	var query struct {
		Viewer struct {
			Login     string
			Name      string
			AvatarURL string `graphql:"avatarUrl"`
		}
	}

	err := c.graphql.Query(ctx, &query, nil)
	if err != nil {
		return nil, err
	}

	return &ViewerInfo{
		Login:     query.Viewer.Login,
		Name:      query.Viewer.Name,
		AvatarURL: query.Viewer.AvatarURL,
	}, nil
}

// GetViewerTeams returns the teams the authenticated user belongs to for a given org.
func (c *Client) GetViewerTeams(ctx context.Context, org string) ([]Team, error) {
	var query struct {
		Organization struct {
			Teams struct {
				Nodes []struct {
					Slug string
					Name string
				}
				PageInfo struct {
					HasNextPage bool
					EndCursor   githubv4.String
				}
			} `graphql:"teams(first: 100, userLogins: [$login], after: $cursor)"`
		} `graphql:"organization(login: $org)"`
	}

	viewer, err := c.GetViewer(ctx)
	if err != nil {
		return nil, err
	}

	variables := map[string]interface{}{
		"org":    githubv4.String(org),
		"login":  githubv4.String(viewer.Login),
		"cursor": (*githubv4.String)(nil),
	}

	var teams []Team
	for {
		err := c.graphql.Query(ctx, &query, variables)
		if err != nil {
			return nil, err
		}
		for _, t := range query.Organization.Teams.Nodes {
			teams = append(teams, Team{Slug: t.Slug, Name: t.Name})
		}
		if !query.Organization.Teams.PageInfo.HasNextPage {
			break
		}
		variables["cursor"] = githubv4.NewString(query.Organization.Teams.PageInfo.EndCursor)
	}

	return teams, nil
}
