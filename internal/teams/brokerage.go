package team

type People []Person

func (p People) Logons() []string {
	result := make([]string, len(p))
	for i, person := range p {
		result[i] = person.Logon
	}
	return result
}

var Brokerage = People{
	{DisplayName: "Aditya Hurry", Logon: "adityahurry"},
	{DisplayName: "Abhimanyu Chugh", Logon: "abhimanyuchugh"},
	{DisplayName: "Adrian Yepremyan", Logon: "adrianyepremyan"},
	{DisplayName: "Agustin Scolieri", Logon: "ascolieri-paxos", Contractor: true},
	{DisplayName: "Chris Powell", Logon: "chris-powell-990"},
	{DisplayName: "Davit Asryan", Logon: "vadrsa-paxos"},
	{DisplayName: "Ivo Fernandes", Logon: "ivoadf"},
	{DisplayName: "Martin Paoloni", Logon: "martinpaoloni", Contractor: true},
	{DisplayName: "Nikolai Andreadi", Logon: "nikolai-andreadi"},
	{DisplayName: "Petros Ring", Logon: "pring789"},
	{DisplayName: "Samuel Azcona", Logon: "sazconaitbit", Contractor: true},
	{DisplayName: "Stephen Lineker-Miller", Logon: "stephen-paxos"},
	{DisplayName: "Tom Wu", Logon: "tomwu-paxos"},
}
