package main

import (
	"embed"
	"log"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

// ensurePATH augments the PATH environment variable on macOS so that CLI
// tools installed in common locations (Homebrew, npm globals, ~/.local/bin)
// are discoverable by exec.LookPath. macOS GUI apps launched from Finder or
// Spotlight inherit a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) that does
// not include these directories.
func ensurePATH() {
	if runtime.GOOS != "darwin" {
		return
	}

	// Start with the current (possibly minimal) PATH.
	current := os.Getenv("PATH")

	// Try to get the user's full login shell PATH via `$SHELL -l -i -c 'echo $PATH'`.
	// The -i flag sources .zshrc/.bashrc in addition to .zprofile/.bash_profile,
	// which is where many users add PATH modifications.
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}
	out, err := exec.Command(shell, "-l", "-i", "-c", "echo $PATH").Output()
	if err == nil {
		shellPath := strings.TrimSpace(string(out))
		if shellPath != "" {
			current = shellPath
		}
	}

	// Always append common directories — these may not be in the shell PATH
	// if the app is launched from Finder/Spotlight with a minimal environment.
	home := os.Getenv("HOME")
	extra := []string{
		"/opt/homebrew/bin",
		"/usr/local/bin",
		home + "/.local/bin",
		home + "/.npm-global/bin",
		"/usr/local/go/bin",
	}

	// Deduplicate: only add directories not already present.
	existing := make(map[string]bool)
	for _, dir := range strings.Split(current, ":") {
		existing[dir] = true
	}
	for _, dir := range extra {
		if !existing[dir] {
			current += ":" + dir
			existing[dir] = true
		}
	}

	os.Setenv("PATH", current)
}

func main() {
	ensurePATH()
	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "Review Deck",
		Width:     1440,
		Height:    900,
		MinWidth:  1024,
		MinHeight: 700,
		AssetServer: &assetserver.Options{
			Assets:     assets,
			Middleware: app.ImageProxyMiddleware(),
		},
		BackgroundColour: &options.RGBA{R: 9, G: 9, B: 11, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		OnDomReady:       app.domReady,
		Mac: &mac.Options{
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
				HideTitle:                  true,
				HideTitleBar:               false,
				FullSizeContent:            true,
			},
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
			About: &mac.AboutInfo{
				Title:   "Review Deck",
				Message: "Pull Request Review Tracker v0.1.0",
			},
		},
		Bind: []any{
			app,
			app.authService,
			app.prService,
			app.settingsService,
			app.repoService,
			app.workspaceService,
			app.notificationService,
		},
	})

	if err != nil {
		log.Fatal("Error:", err.Error())
	}
}
