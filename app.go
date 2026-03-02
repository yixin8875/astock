package main

import (
	"context"
	"database/sql"
	"embed"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

//go:embed db/schema.sql db/seed.sql
var dbFS embed.FS

// App struct
type App struct {
	ctx    context.Context
	db     *sql.DB
	dbPath string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.dbPath = resolveDBPath()
	a.db = mustInitDatabase(a.dbPath)
}

func (a *App) shutdown(_ context.Context) {
	if a.db != nil {
		_ = a.db.Close()
	}
}

func resolveDBPath() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return filepath.Join("data", "ashare_theme.db")
	}
	return filepath.Join(configDir, "astock", "ashare_theme.db")
}
