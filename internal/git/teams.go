package git

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/google/go-github/v80/github"
)

type Team struct {
	Team    *github.Team
	Members []*github.User
}

// GetAllTeams retrieves all teams and their members from the GitHub organization.
func (c *Client) GetAllTeams(
	ctx context.Context,
) ([]*Team, error) {
	search := &ListTeams{Client: c}
	teams, err := Paginator(ctx, search, ProcessBasic, RateLimiterBasic)

	if err != nil {
		return nil, fmt.Errorf("error getting teams: %w", err)
	}

	sort.Slice(teams, func(i, j int) bool {
		return strings.Compare(teams[i].GetName(), teams[j].GetName()) == -1
	})

	result := make([]*Team, len(teams))

	for i, team := range teams {
		memberSearch := &ListTeamMembers{
			OrgID:  22945721,
			TeamID: team.GetID(),
			Client: c,
		}

		members, err := Paginator(ctx, memberSearch, ProcessBasic, RateLimiterBasic)

		if err != nil {
			return nil, fmt.Errorf("error getting team members: %w", err)
		}

		result[i] = &Team{
			Team:    team,
			Members: members,
		}
	}

	return result, nil
}
