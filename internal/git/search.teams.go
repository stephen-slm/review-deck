package git

import (
	"context"

	"github.com/google/go-github/v80/github"
)

type ListTeams struct {
	Client *Client
}

func (l *ListTeams) List(ctx context.Context, opt *github.ListOptions) ([]*github.Team, *github.Response, error) {
	teams, response, err := Execute(ctx, l.Client, func() ([]*github.Team, *github.Response, error) {
		return l.Client.githubClient.Teams.ListTeams(ctx, "paxosglobal", opt)
	})

	if err != nil {
		return nil, response, err
	}

	if teams != nil {
		return teams, response, err
	}

	return nil, response, err
}

type ListTeamMembers struct {
	OrgID  int64
	TeamID int64
	Client *Client
}

func (l *ListTeamMembers) List(ctx context.Context, opt *github.ListOptions) ([]*github.User, *github.Response, error) {
	members, response, err := Execute(ctx, l.Client, func() ([]*github.User, *github.Response, error) {
		return l.Client.githubClient.Teams.ListTeamMembersByID(ctx, l.OrgID, l.TeamID, &github.TeamListTeamMembersOptions{
			ListOptions: *opt,
		})
	})

	if err != nil {
		return nil, response, err
	}

	if members != nil {
		return members, response, err
	}

	return nil, response, err
}
