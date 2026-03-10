APP := ./build/bin/review-deck.app

.PHONY: build dev

## Build the production app and re-sign so native notifications work.
build:
	wails build
	@echo "Re-signing app bundle for macOS notifications..."
	codesign --force --deep --sign - $(APP)

## Start the Wails dev server.
dev:
	wails dev
