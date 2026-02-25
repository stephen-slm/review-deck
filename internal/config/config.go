package config

import (
	"os"
	"path/filepath"
)

const AppName = "reviewdeck"

// DataDir returns the path to the application's data directory.
// On macOS: ~/Library/Application Support/reviewdeck
// On Linux: ~/.local/share/reviewdeck
// Falls back to ~/.reviewdeck
func DataDir() string {
	if dir, err := os.UserConfigDir(); err == nil {
		return filepath.Join(dir, AppName)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".", "."+AppName)
	}
	return filepath.Join(home, "."+AppName)
}
