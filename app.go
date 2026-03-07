package main

import (
	"context"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
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

	authService      *services.AuthService
	prService        *services.PullRequestService
	settingsService  *services.SettingsService
	repoService      *services.RepoService
	workspaceService *services.WorkspaceService
	poller           *services.Poller
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
	repoService := services.NewRepoService(db)
	workspaceService := services.NewWorkspaceService(db)
	poller := services.NewPoller(db, 5*time.Minute)

	// Register consumers so login/logout propagates the client.
	authService.RegisterConsumer(prService)
	authService.RegisterConsumer(repoService)
	authService.RegisterConsumer(poller)

	app := &App{
		db:               db,
		authService:      authService,
		prService:        prService,
		settingsService:  settingsService,
		repoService:      repoService,
		workspaceService: workspaceService,
		poller:           poller,
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
	a.repoService.SetContext(ctx)
	a.workspaceService.SetContext(ctx)
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

// SyncOrgMembers forces a refresh of the org members cache for the given org.
func (a *App) SyncOrgMembers(org string) error {
	return a.prService.SyncOrgMembers(org)
}

// SetPollInterval updates the poller interval and persists it to the database.
func (a *App) SetPollInterval(minutes int) error {
	minutes = max(1, min(60, minutes))
	if err := a.db.SetSetting("poll_interval_minutes", strconv.Itoa(minutes)); err != nil {
		return err
	}
	a.poller.SetInterval(minutes)
	return nil
}

// ImageProxyMiddleware returns an HTTP middleware that proxies image requests
// through the authenticated GitHub client. Requests to /api/proxy/image?url=<encoded>
// are intercepted; all other requests pass through to the default asset handler.
func (a *App) ImageProxyMiddleware() func(next http.Handler) http.Handler {
	// Allowed host suffixes for proxied URLs.
	allowedHosts := []string{
		"githubusercontent.com",
		"github.com",
		"avatars.githubusercontent.com",
		"user-images.githubusercontent.com",
		"private-user-images.githubusercontent.com",
	}

	isAllowed := func(rawURL string) bool {
		u, err := url.Parse(rawURL)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
			return false
		}
		host := strings.ToLower(u.Hostname())
		return slices.ContainsFunc(allowedHosts, func(allowed string) bool {
			return host == allowed || strings.HasSuffix(host, "."+allowed)
		})
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/proxy/image" {
				next.ServeHTTP(w, r)
				return
			}

			targetURL := r.URL.Query().Get("url")
			if targetURL == "" {
				http.Error(w, "missing url parameter", http.StatusBadRequest)
				return
			}

			if !isAllowed(targetURL) {
				http.Error(w, "url not allowed", http.StatusForbidden)
				return
			}

			client := a.authService.GetClient()
			var httpClient *http.Client
			if client != nil {
				httpClient = client.HTTPClient()
			} else {
				httpClient = http.DefaultClient
			}

			req, err := http.NewRequestWithContext(r.Context(), "GET", targetURL, nil)
			if err != nil {
				http.Error(w, "bad request", http.StatusBadRequest)
				return
			}

			resp, err := httpClient.Do(req)
			if err != nil {
				http.Error(w, "upstream error", http.StatusBadGateway)
				return
			}
			defer resp.Body.Close()

			// Forward content type and cache headers.
			if ct := resp.Header.Get("Content-Type"); ct != "" {
				w.Header().Set("Content-Type", ct)
			}
			if cl := resp.Header.Get("Content-Length"); cl != "" {
				w.Header().Set("Content-Length", cl)
			}
			w.Header().Set("Cache-Control", "private, max-age=3600")
			w.WriteHeader(resp.StatusCode)
			io.Copy(w, resp.Body)
		})
	}
}

// shutdown is called when the app is closing.
func (a *App) shutdown(ctx context.Context) {
	a.poller.Stop()
	if a.db != nil {
		a.db.Close()
	}
}
