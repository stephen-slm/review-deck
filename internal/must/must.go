package must

func Must(err error) {
	if err != nil {
		panic(err)
	}
}

func MustValue[T any](val T, err error) T {
	Must(err)
	return val
}
