package main

import (
	"context"
	"log"
	"os"
	"path/filepath"

	"pull-request-reviewing/internal/config"
	gh "pull-request-reviewing/internal/github"
	"pull-request-reviewing/internal/services"
	"pull-request-reviewing/internal/storage"
)

// App struct holds the application lifecycle and services.
type App struct {
	ctx context.Context

	db       *storage.DB
	ghClient *gh.Client

	authService     *services.AuthService
	prService       *services.PullRequestService
	settingsService *services.SettingsService
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

	// Register prService as a consumer so login/logout propagates the client.
	authService.RegisterConsumer(prService)

	app := &App{
		db:              db,
		authService:     authService,
		prService:       prService,
		settingsService: settingsService,
	}

	// If we have a stored token, initialize the GitHub client.
	token, _ := db.GetSetting("github_token")
	if token != "" {
		client, err := gh.NewClient(token)
		if err == nil {
			app.ghClient = client
			authService.SetClient(client)
			prService.SetClient(client)
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
	// Future: emit initial state events to frontend
}

// shutdown is called when the app is closing.
func (a *App) shutdown(ctx context.Context) {
	if a.db != nil {
		a.db.Close()
	}
}
