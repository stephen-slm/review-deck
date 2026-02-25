package git

import (
	"fmt"
	"time"
)

type SearchBuilder struct {
	org              string
	pr               bool
	createdStartTime time.Time
	createdEndTime   time.Time
	reviewedBy       string
	mergedOnly       bool
	author           string
}

func NewSearchBuilder() *SearchBuilder {
	return &SearchBuilder{}
}

func (s *SearchBuilder) Org(org string) *SearchBuilder {
	s.org = org
	return s
}

func (s *SearchBuilder) PR(pr bool) *SearchBuilder {
	s.pr = pr
	return s
}

func (s *SearchBuilder) StartTime(t time.Time) *SearchBuilder {
	s.createdStartTime = t
	return s
}

func (s *SearchBuilder) EndTime(t time.Time) *SearchBuilder {
	s.createdEndTime = t
	return s
}

func (s *SearchBuilder) ReviewedBy(reviewedBy string) *SearchBuilder {
	s.reviewedBy = reviewedBy
	return s
}

func (s *SearchBuilder) Merged(mergedOnly bool) *SearchBuilder {
	s.mergedOnly = mergedOnly
	return s
}

func (s *SearchBuilder) Author(author string) *SearchBuilder {
	s.author = author
	return s
}

func (s *SearchBuilder) Build() string {
	var output string

	if s.org != "" {
		output += fmt.Sprintf("org:%s ", s.org)
	}

	if s.pr {
		output += "is:pr "
	}

	if !s.createdStartTime.IsZero() && s.createdEndTime.IsZero() {
		output += fmt.Sprintf("created:>=%s ", s.createdStartTime.Format("2006-01-02"))
	}
	if s.createdStartTime.IsZero() && !s.createdEndTime.IsZero() {
		output += fmt.Sprintf("created:<=%s ", s.createdEndTime.Format("2006-01-02"))
	}
	if !s.createdStartTime.IsZero() && !s.createdEndTime.IsZero() {
		output += fmt.Sprintf("created:%s..%s ", s.createdStartTime.Format("2006-01-02"), s.createdEndTime.Format("2006-01-02"))
	}

	if s.mergedOnly {
		output += fmt.Sprintf("is:merged ")
	}
	if s.reviewedBy != "" {
		output += fmt.Sprintf("reviewed-by:%s ", s.reviewedBy)
	}
	if s.author != "" {
		output += fmt.Sprintf("author:%s ", s.author)
	}

	output += "sort:created-asc"

	fmt.Println("output=", output)

	return output

}
