package calendar

import (
	"fmt"
	"strings"
	"time"
)

type Month struct {
	name      string
	startDate time.Time
	endDate   time.Time
}

func (m Month) String() string {
	return fmt.Sprintf("%s-%d-%d", strings.ToLower(m.Name()),
		m.startDate.Day(), m.endDate.Day())
}

func (m Month) Name() string {
	return m.name
}

func (m Month) Start(year int) time.Time {
	return time.Date(year, m.startDate.Month(), m.startDate.Day(), 0, 0, 0, 0, time.UTC)
}

func (m Month) End(year int) time.Time {
	return time.Date(year, m.endDate.Month(), m.endDate.Day(), 0, 0, 0, 0, time.UTC)
}

func (m Month) Weeks(year int) []Week {
	var weeks []Week

	start := m.Start(year)
	end := m.End(year)

	for start.Before(end) {
		beginOfWeek := start
		endOfWeek := start.Add(time.Hour * 24 * 7)

		if endOfWeek.After(end) {
			endOfWeek = end
		}

		weeks = append(weeks, Week{startDate: beginOfWeek, endDate: endOfWeek})
		start = endOfWeek.Add(time.Hour * 24)
	}

	return weeks
}

type Week struct {
	startDate time.Time
	endDate   time.Time
}

func (m Week) Start(year int) time.Time {
	return time.Date(year, m.startDate.Month(), m.startDate.Day(), 0, 0, 0, 0, time.UTC)
}

func (m Week) End(year int) time.Time {
	return time.Date(year, m.endDate.Month(), m.endDate.Day(), 0, 0, 0, 0, time.UTC)
}

func (m Week) String() string {
	return fmt.Sprintf("%d-%d", m.startDate.Day(), m.endDate.Day())
}

var Months = []Month{
	January, February, March, April, May, June, July, August, September, October, November, December,
}

var January = Month{
	name:      "January",
	startDate: time.Date(time.Now().UTC().Year(), 1, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 1, 31, 0, 0, 0, 0, time.UTC),
}

var February = Month{
	name:      "February",
	startDate: time.Date(time.Now().UTC().Year(), 2, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 2, 28, 0, 0, 0, 0, time.UTC),
}

var March = Month{
	name:      "March",
	startDate: time.Date(time.Now().UTC().Year(), 3, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 3, 31, 0, 0, 0, 0, time.UTC),
}

var April = Month{
	name:      "April",
	startDate: time.Date(time.Now().UTC().Year(), 4, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 4, 30, 0, 0, 0, 0, time.UTC),
}

var May = Month{
	name:      "May",
	startDate: time.Date(time.Now().UTC().Year(), 5, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 5, 31, 0, 0, 0, 0, time.UTC),
}

var June = Month{
	name:      "June",
	startDate: time.Date(time.Now().UTC().Year(), 6, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 6, 30, 0, 0, 0, 0, time.UTC),
}

var July = Month{
	name:      "July",
	startDate: time.Date(time.Now().UTC().Year(), 7, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 7, 31, 0, 0, 0, 0, time.UTC),
}

var August = Month{
	name:      "August",
	startDate: time.Date(time.Now().UTC().Year(), 8, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 8, 31, 0, 0, 0, 0, time.UTC),
}

var September = Month{
	name:      "September",
	startDate: time.Date(time.Now().UTC().Year(), 9, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 9, 30, 0, 0, 0, 0, time.UTC),
}

var October = Month{
	name:      "October",
	startDate: time.Date(time.Now().UTC().Year(), 10, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 10, 31, 0, 0, 0, 0, time.UTC),
}

var November = Month{
	name:      "November",
	startDate: time.Date(time.Now().UTC().Year(), 11, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 11, 30, 0, 0, 0, 0, time.UTC),
}

var December = Month{
	name:      "December",
	startDate: time.Date(time.Now().UTC().Year(), 12, 1, 0, 0, 0, 0, time.UTC),
	endDate:   time.Date(time.Now().UTC().Year(), 12, 31, 0, 0, 0, 0, time.UTC),
}
