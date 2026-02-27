package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
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
