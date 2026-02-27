package gitutil

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// OpenTerminal opens a terminal window at the given directory.
// On macOS, it prefers iTerm2 if installed, falling back to Terminal.app.
func OpenTerminal(dir string) error {
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return fmt.Errorf("resolve path: %w", err)
	}

	if _, statErr := os.Stat(absDir); statErr != nil {
		return fmt.Errorf("directory does not exist: %s", absDir)
	}

	if isITerm2Installed() {
		return openITerm2(absDir)
	}

	return openTerminalApp(absDir)
}

// isITerm2Installed checks whether iTerm2 is installed at the standard location.
func isITerm2Installed() bool {
	_, err := os.Stat("/Applications/iTerm.app")
	return err == nil
}

// openITerm2 opens a new iTerm2 window at the given directory via AppleScript.
func openITerm2(dir string) error {
	// Escape single quotes in the path for AppleScript.
	escaped := strings.ReplaceAll(dir, "'", "'\\''")
	script := fmt.Sprintf(
		`tell application "iTerm2" to create window with default profile command "cd '%s' && exec $SHELL"`,
		escaped,
	)
	cmd := exec.Command("osascript", "-e", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("open iTerm2: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// openTerminalApp opens the macOS Terminal.app at the given directory.
func openTerminalApp(dir string) error {
	cmd := exec.Command("open", "-a", "Terminal", dir)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("open Terminal: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}
