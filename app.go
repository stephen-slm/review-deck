package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"review-deck/internal/config"
	gh "review-deck/internal/github"
	"review-deck/internal/services"
	"review-deck/internal/storage"
)

// App struct holds the application lifecycle and services.
type App struct {
	ctx context.Context

	db       *storage.DB
	ghClient *gh.Client

	authService     *services.AuthService
	prService       *services.PullRequestService
	settingsService *services.SettingsService
	poller          *services.Poller
}

// NewApp creates a new App. Initializes the database and services
// eagerly so they are non-nil when Wails binds them.
func NewApp() *App {
	dataDir := config.DataDir()
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("failed to create data directory: %v", err)
	}

	dbPath := filepath.Join(dataDir, "reviewdeck.db")
	db, err := storage.Open(dbPath)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}

	if err := db.Migrate(); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	authService := services.NewAuthService(db)
	prService := services.NewPullRequestService(db)
	settingsService := services.NewSettingsService(db)
	poller := services.NewPoller(db, 5*time.Minute)

	// Register consumers so login/logout propagates the client.
	authService.RegisterConsumer(prService)
	authService.RegisterConsumer(poller)

	app := &App{
		db:              db,
		authService:     authService,
		prService:       prService,
		settingsService: settingsService,
		poller:          poller,
	}

	// If we have a stored token, initialize the GitHub client.
	token, _ := db.GetSetting("github_token")
	if token != "" {
		client, err := gh.NewClient(token)
		if err == nil {
			app.ghClient = client
			authService.SetClient(client)
		}
	}

	return app
}

// startup is called when the app starts and the window is being created.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// domReady is called after the frontend DOM has been loaded.
func (a *App) domReady(ctx context.Context) {
	// Start the background poller if we have an authenticated client.
	if a.authService.IsAuthenticated() {
		a.poller.Start(ctx, wailsRuntime.EventsEmit)
	}
}

// StartPoller starts the background polling loop. Called from frontend after login.
func (a *App) StartPoller() {
	if a.ctx != nil && a.authService.IsAuthenticated() {
		a.poller.Start(a.ctx, wailsRuntime.EventsEmit)
	}
}

// StopPoller stops the background polling loop. Called from frontend on logout.
func (a *App) StopPoller() {
	a.poller.Stop()
}

// shutdown is called when the app is closing.
func (a *App) shutdown(ctx context.Context) {
	a.poller.Stop()
	if a.db != nil {
		a.db.Close()
	}
}
