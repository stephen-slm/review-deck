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

	// Try to get the user's login shell PATH via `$SHELL -l -c 'echo $PATH'`.
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}
	out, err := exec.Command(shell, "-l", "-c", "echo $PATH").Output()
	if err == nil {
		shellPath := strings.TrimSpace(string(out))
		if shellPath != "" {
			os.Setenv("PATH", shellPath)
			return
		}
	}

	// Fallback: manually append common directories.
	extra := []string{
		"/opt/homebrew/bin",
		"/usr/local/bin",
		os.Getenv("HOME") + "/.local/bin",
		os.Getenv("HOME") + "/.npm-global/bin",
		"/usr/local/go/bin",
	}
	current := os.Getenv("PATH")
	os.Setenv("PATH", current+":"+strings.Join(extra, ":"))
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
		Bind: []interface{}{
			app,
			app.authService,
			app.prService,
			app.settingsService,
			app.repoService,
			app.workspaceService,
		},
	})

	if err != nil {
		log.Fatal("Error:", err.Error())
	}
}
