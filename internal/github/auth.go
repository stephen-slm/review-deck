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

// SearchOrgMembers returns org members whose login matches a prefix query.
func (c *Client) SearchOrgMembers(ctx context.Context, org string, query string) ([]User, error) {
	// GitHub GraphQL doesn't have a direct org member search, so we use the
	// REST-style search via GraphQL search type: USER with org qualifier.
	var q struct {
		Search struct {
			Nodes []struct {
				User struct {
					Login     string
					Name      string
					AvatarURL string `graphql:"avatarUrl"`
					ID        string `graphql:"id"`
				} `graphql:"... on User"`
			}
		} `graphql:"search(query: $query, type: USER, first: 10)"`
	}

	searchQuery := query + " org:" + org + " type:user"
	variables := map[string]interface{}{
		"query": githubv4.String(searchQuery),
	}

	err := c.graphql.Query(ctx, &q, variables)
	if err != nil {
		return nil, err
	}

	var users []User
	for _, n := range q.Search.Nodes {
		if n.User.Login == "" {
			continue
		}
		users = append(users, User{
			NodeID:    n.User.ID,
			Login:     n.User.Login,
			Name:      n.User.Name,
			AvatarURL: n.User.AvatarURL,
		})
	}
	return users, nil
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
