package git

import (
	"context"
)

var ProcessBasic = &Process{}

type Process struct {
}

func (p *Process) Process(_ context.Context, item any) error {
	return nil
}
