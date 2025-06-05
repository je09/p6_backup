# Roland P6 Backup Tool - Makefile
# Build and launch automation for Electron TypeScript application

# Variables
NODE_MODULES := node_modules
DIST_DIR := dist
RELEASE_DIR := release

# Default target
.PHONY: all
all: install build

# Help target
.PHONY: help
help:
	@echo "Roland P6 Backup Tool - Available Make targets:"
	@echo ""
	@echo "Setup and Installation:"
	@echo "  install          Install dependencies"
	@echo "  clean            Clean build artifacts and node_modules"
	@echo "  clean-build      Clean only build artifacts"
	@echo ""
	@echo "Development:"
	@echo "  dev              Start development server with hot reload"
	@echo "  build-dev        Build for development"
	@echo "  lint             Run ESLint"
	@echo "  test             Run tests"
	@echo ""
	@echo "Production:"
	@echo "  build            Build for production"
	@echo "  start            Start the built application"
	@echo "  package          Package for current platform"
	@echo "  package-mac      Package for macOS"
	@echo "  package-win      Package for Windows"
	@echo ""
	@echo "Utilities:"
	@echo "  check-deps       Check if dependencies are installed"
	@echo "  usb-test         Test USB functionality"
	@echo "  open-release     Open the release directory"

# Installation
.PHONY: install
install:
	@echo "Installing dependencies..."
	npm install

# Check if dependencies are installed
.PHONY: check-deps
check-deps:
	@if [ ! -d "$(NODE_MODULES)" ]; then \
		echo "Dependencies not installed. Run 'make install' first."; \
		exit 1; \
	fi

# Development
.PHONY: dev
dev: check-deps
	@echo "Starting development server..."
	npm run dev

.PHONY: build-dev
build-dev: check-deps
	@echo "Building for development..."
	npm run build:dev

# Production build
.PHONY: build
build: check-deps
	@echo "Building for production..."
	npm run build

# Start the built application
.PHONY: start
start: check-deps
	@if [ ! -f "$(DIST_DIR)/main/main.js" ]; then \
		echo "Application not built. Run 'make build' first."; \
		exit 1; \
	fi
	@echo "Starting Roland P6 Backup Tool..."
	npm start

# Packaging
.PHONY: package
package: build
	@echo "Packaging for current platform..."
	npm run package

.PHONY: package-mac
package-mac: build
	@echo "Packaging for macOS..."
	npm run package:mac

.PHONY: package-win
package-win: build
	@echo "Packaging for Windows..."
	npm run package:win

# Testing and linting
.PHONY: test
test: check-deps
	@echo "Running tests..."
	npm test

.PHONY: lint
lint: check-deps
	@echo "Running ESLint..."
	npm run lint

# USB testing utility
.PHONY: usb-test
usb-test: check-deps
	@if [ -f "test-usb.js" ]; then \
		echo "Running USB test..."; \
		node test-usb.js; \
	else \
		echo "USB test file not found."; \
	fi

# Cleaning
.PHONY: clean-build
clean-build:
	@echo "Cleaning build artifacts..."
	rm -rf $(DIST_DIR)
	rm -rf $(RELEASE_DIR)

.PHONY: clean
clean: clean-build
	@echo "Cleaning all artifacts and dependencies..."
	rm -rf $(NODE_MODULES)
	rm -rf package-lock.json

# Utilities
.PHONY: open-release
open-release:
	@if [ -d "$(RELEASE_DIR)" ]; then \
		open $(RELEASE_DIR); \
	else \
		echo "Release directory not found. Run 'make package' first."; \
	fi

# Development workflow shortcuts
.PHONY: quick-start
quick-start:
	@echo "Quick start: installing dependencies and starting development server..."
	make install
	make dev

.PHONY: release
release: clean-build build package
	@echo "Full release build completed!"
	@echo "Packaged application available in $(RELEASE_DIR)/"

# Platform-specific shortcuts
.PHONY: mac-release
mac-release: clean-build build package-mac
	@echo "macOS release build completed!"

.PHONY: win-release
win-release: clean-build build package-win
	@echo "Windows release build completed!"

# Debug and info targets
.PHONY: info
info:
	@echo "Project Information:"
	@echo "  Node.js version: $$(node --version)"
	@echo "  npm version:     $$(npm --version)"
	@echo "  Platform:        $$(uname -s)"
	@echo "  Architecture:    $$(uname -m)"
	@echo ""
	@echo "Project structure:"
	@echo "  Source code:     src/"
	@echo "  Build output:    $(DIST_DIR)/"
	@echo "  Release output:  $(RELEASE_DIR)/"
	@echo "  Dependencies:    $(NODE_MODULES)/"

# Watch file changes and rebuild (alternative to dev)
.PHONY: watch
watch: check-deps
	@echo "Watching for file changes..."
	npx concurrently "tsc -p tsconfig.main.json -w" "webpack --mode development --watch"

# TypeScript compilation only
.PHONY: compile
compile: check-deps
	@echo "Compiling TypeScript..."
	npx tsc -p tsconfig.main.json

# Webpack build only
.PHONY: webpack
webpack: check-deps
	@echo "Running webpack..."
	npx webpack --mode development
