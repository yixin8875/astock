package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func mustInitDatabase(dbPath string) *sql.DB {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		panic(fmt.Errorf("create db directory failed: %w", err))
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		panic(fmt.Errorf("open sqlite failed: %w", err))
	}

	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`PRAGMA foreign_keys = ON;`); err != nil {
		panic(fmt.Errorf("enable foreign keys failed: %w", err))
	}

	schemaSQL, err := dbFS.ReadFile("db/schema.sql")
	if err != nil {
		panic(fmt.Errorf("read schema failed: %w", err))
	}
	if _, err := db.Exec(string(schemaSQL)); err != nil {
		panic(fmt.Errorf("apply schema failed: %w", err))
	}
	if err := applyMigrations(db); err != nil {
		panic(fmt.Errorf("apply migrations failed: %w", err))
	}

	var companyCount int64
	if err := db.QueryRow(`SELECT COUNT(1) FROM companies`).Scan(&companyCount); err != nil {
		panic(fmt.Errorf("check seed state failed: %w", err))
	}
	if companyCount == 0 {
		seedSQL, err := dbFS.ReadFile("db/seed.sql")
		if err != nil {
			panic(fmt.Errorf("read seed failed: %w", err))
		}
		if _, err := db.Exec(string(seedSQL)); err != nil {
			panic(fmt.Errorf("apply seed failed: %w", err))
		}
	}

	return db
}

func applyMigrations(db *sql.DB) error {
	hasPinned, err := columnExists(db, "themes", "is_pinned_main")
	if err != nil {
		return err
	}
	if !hasPinned {
		if _, err := db.Exec(`ALTER TABLE themes ADD COLUMN is_pinned_main INTEGER NOT NULL DEFAULT 0`); err != nil {
			return err
		}
	}

	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_themes_pinned ON themes(is_pinned_main, heat_score DESC)`); err != nil {
		return err
	}

	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS theme_change_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id INTEGER NOT NULL,
  old_heat_score INTEGER,
  new_heat_score INTEGER,
  old_lifecycle_stage TEXT,
  new_lifecycle_stage TEXT,
  old_is_pinned_main INTEGER,
  new_is_pinned_main INTEGER,
  change_note TEXT,
  operator TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(theme_id) REFERENCES themes(id) ON DELETE CASCADE
)`); err != nil {
		return err
	}
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_theme_change_logs_theme ON theme_change_logs(theme_id, created_at DESC)`); err != nil {
		return err
	}

	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`); err != nil {
		return err
	}

	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS ai_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL DEFAULT 'general',
  scope_id INTEGER NOT NULL DEFAULT 0,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  file_data BLOB NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`); err != nil {
		return err
	}
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_ai_attachments_scope ON ai_attachments(scope_type, scope_id, created_at DESC)`); err != nil {
		return err
	}
	return nil
}

func columnExists(db *sql.DB, table string, column string) (bool, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			cid       int64
			name      string
			colType   string
			notNull   int64
			dfltValue sql.NullString
			pk        int64
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

func clean(s string) string {
	return strings.TrimSpace(s)
}

func (a *App) DBPath() string {
	return a.dbPath
}

func (a *App) DashboardStats() (DashboardStats, error) {
	var stats DashboardStats
	err := a.db.QueryRow(`
SELECT
	(SELECT COUNT(1) FROM companies),
	(SELECT COUNT(1) FROM themes),
	(SELECT COUNT(1) FROM company_themes),
	(SELECT COUNT(1) FROM investment_theses WHERE status = 'active')
`).Scan(&stats.CompanyCount, &stats.ThemeCount, &stats.CompanyThemeRows, &stats.ActiveThesisRows)
	return stats, err
}

func (a *App) ListCompanies(q string) ([]Company, error) {
	query := `
SELECT id, ts_code, company_name, industry_l1, industry_l2, listing_board, status, created_at, updated_at
FROM companies
`
	args := make([]any, 0, 2)
	if clean(q) != "" {
		query += ` WHERE ts_code LIKE ? OR company_name LIKE ? `
		like := "%" + clean(q) + "%"
		args = append(args, like, like)
	}
	query += ` ORDER BY updated_at DESC, id DESC `

	rows, err := a.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]Company, 0)
	for rows.Next() {
		var c Company
		if err := rows.Scan(
			&c.ID, &c.TsCode, &c.CompanyName, &c.IndustryL1, &c.IndustryL2, &c.ListingBoard, &c.Status, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		c.TsCode = displayTsCode(c.TsCode)
		res = append(res, c)
	}
	return res, rows.Err()
}

func (a *App) CreateCompany(input CompanyInput) (Company, error) {
	if clean(input.TsCode) == "" || clean(input.CompanyName) == "" {
		return Company{}, errors.New("ts_code and company_name are required")
	}

	result, err := a.db.Exec(`
INSERT INTO companies (ts_code, company_name, industry_l1, industry_l2, listing_board, status)
VALUES (?, ?, ?, ?, ?, 'active')
`,
		clean(input.TsCode),
		clean(input.CompanyName),
		clean(input.IndustryL1),
		clean(input.IndustryL2),
		clean(input.ListingBoard),
	)
	if err != nil {
		return Company{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Company{}, err
	}

	return a.getCompanyByID(id)
}

func (a *App) UpdateCompany(input CompanyUpdateInput) (Company, error) {
	if input.ID <= 0 {
		return Company{}, errors.New("id is required")
	}
	if clean(input.CompanyName) == "" {
		return Company{}, errors.New("company_name is required")
	}

	var existingTsCode string
	if err := a.db.QueryRow(`SELECT ts_code FROM companies WHERE id = ?`, input.ID).Scan(&existingTsCode); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Company{}, errors.New("company not found")
		}
		return Company{}, err
	}

	nextTsCode := clean(input.TsCode)
	if nextTsCode == "" {
		nextTsCode = existingTsCode
	}
	if clean(nextTsCode) == "" {
		return Company{}, errors.New("ts_code is required")
	}

	_, err := a.db.Exec(`
UPDATE companies
SET ts_code = ?, company_name = ?, industry_l1 = ?, industry_l2 = ?, listing_board = ?, updated_at = datetime('now')
WHERE id = ?
`, nextTsCode, clean(input.CompanyName), clean(input.IndustryL1), clean(input.IndustryL2), clean(input.ListingBoard), input.ID)
	if err != nil {
		return Company{}, err
	}
	return a.getCompanyByID(input.ID)
}

func (a *App) getCompanyByID(id int64) (Company, error) {
	var c Company
	err := a.db.QueryRow(`
SELECT id, ts_code, company_name, industry_l1, industry_l2, listing_board, status, created_at, updated_at
FROM companies WHERE id = ?`, id).Scan(
		&c.ID, &c.TsCode, &c.CompanyName, &c.IndustryL1, &c.IndustryL2, &c.ListingBoard, &c.Status, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return Company{}, err
	}
	c.TsCode = displayTsCode(c.TsCode)
	return c, nil
}

func (a *App) ListThemes(q string) ([]Theme, error) {
	query := `
SELECT id, theme_name, theme_type, description, lifecycle_stage, heat_score, is_pinned_main, created_at, updated_at
FROM themes
`
	args := make([]any, 0, 1)
	if clean(q) != "" {
		query += ` WHERE theme_name LIKE ? `
		args = append(args, "%"+clean(q)+"%")
	}
	query += ` ORDER BY is_pinned_main DESC, heat_score DESC, updated_at DESC `

	rows, err := a.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]Theme, 0)
	for rows.Next() {
		var t Theme
		var pinned int64
		if err := rows.Scan(
			&t.ID, &t.ThemeName, &t.ThemeType, &t.Description, &t.LifecycleStage, &t.HeatScore, &pinned, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		t.IsPinnedMain = pinned == 1
		res = append(res, t)
	}
	return res, rows.Err()
}

func (a *App) CreateTheme(input ThemeInput) (Theme, error) {
	if clean(input.ThemeName) == "" {
		return Theme{}, errors.New("theme_name is required")
	}

	themeType := clean(input.ThemeType)
	if themeType == "" {
		themeType = "concept"
	}
	stage := clean(input.LifecycleStage)
	if stage == "" {
		stage = "growth"
	}
	heat := input.HeatScore
	if heat <= 0 {
		heat = 50
	}
	if heat > 100 {
		heat = 100
	}

	result, err := a.db.Exec(`
INSERT INTO themes (theme_name, theme_type, description, lifecycle_stage, heat_score, is_pinned_main)
VALUES (?, ?, ?, ?, ?, 0)
`, clean(input.ThemeName), themeType, clean(input.Description), stage, heat)
	if err != nil {
		return Theme{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Theme{}, err
	}

	return a.getThemeByID(id)
}

func (a *App) LinkCompanyTheme(input CompanyThemeInput) (CompanyThemeView, error) {
	if input.CompanyID <= 0 || input.ThemeID <= 0 {
		return CompanyThemeView{}, errors.New("company_id and theme_id are required")
	}
	score := input.RelevanceScore
	if score <= 0 {
		score = 50
	}
	if score > 100 {
		score = 100
	}
	isPrimary := 0
	if input.IsPrimary {
		isPrimary = 1
	}

	_, err := a.db.Exec(`
INSERT INTO company_themes (company_id, theme_id, relevance_score, role_in_chain, is_primary, evidence_summary)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(company_id, theme_id) DO UPDATE SET
  relevance_score=excluded.relevance_score,
  role_in_chain=excluded.role_in_chain,
  is_primary=excluded.is_primary,
  evidence_summary=excluded.evidence_summary,
  updated_at=datetime('now')
`, input.CompanyID, input.ThemeID, score, clean(input.RoleInChain), isPrimary, clean(input.EvidenceSum))
	if err != nil {
		return CompanyThemeView{}, err
	}

	var id int64
	if err := a.db.QueryRow(
		`SELECT id FROM company_themes WHERE company_id = ? AND theme_id = ?`,
		input.CompanyID,
		input.ThemeID,
	).Scan(&id); err != nil {
		return CompanyThemeView{}, err
	}
	return a.getCompanyThemeByID(id)
}

func (a *App) getCompanyThemeByID(id int64) (CompanyThemeView, error) {
	var row CompanyThemeView
	var isPrimary int64
	err := a.db.QueryRow(`
SELECT
  ct.id, ct.company_id, ct.theme_id,
  c.ts_code, c.company_name,
  t.theme_name,
  ct.relevance_score, ct.role_in_chain, ct.is_primary, ct.evidence_summary,
  COALESCE((
    SELECT it.thesis_title
    FROM investment_theses it
    WHERE it.company_theme_id = ct.id
    ORDER BY it.thesis_version DESC
    LIMIT 1
  ), ''),
  ct.updated_at
FROM company_themes ct
JOIN companies c ON c.id = ct.company_id
JOIN themes t ON t.id = ct.theme_id
WHERE ct.id = ?
	`, id).Scan(
		&row.ID, &row.CompanyID, &row.ThemeID, &row.TsCode, &row.CompanyName, &row.ThemeName,
		&row.RelevanceScore, &row.RoleInChain, &isPrimary, &row.EvidenceSum, &row.LatestThesis, &row.UpdatedAt,
	)
	row.TsCode = displayTsCode(row.TsCode)
	row.IsPrimary = isPrimary == 1
	return row, err
}

func (a *App) ListCompanyThemes(companyID int64, themeID int64, primaryOnly bool) ([]CompanyThemeView, error) {
	base := `
SELECT
  ct.id, ct.company_id, ct.theme_id,
  c.ts_code, c.company_name,
  t.theme_name,
  ct.relevance_score, ct.role_in_chain, ct.is_primary, ct.evidence_summary,
  COALESCE((
    SELECT it.thesis_title
    FROM investment_theses it
    WHERE it.company_theme_id = ct.id
    ORDER BY it.thesis_version DESC
    LIMIT 1
  ), ''),
  ct.updated_at
FROM company_themes ct
JOIN companies c ON c.id = ct.company_id
JOIN themes t ON t.id = ct.theme_id
WHERE 1=1
`
	args := make([]any, 0, 3)
	if companyID > 0 {
		base += ` AND ct.company_id = ?`
		args = append(args, companyID)
	}
	if themeID > 0 {
		base += ` AND ct.theme_id = ?`
		args = append(args, themeID)
	}
	if primaryOnly {
		base += ` AND ct.is_primary = 1`
	}
	base += ` ORDER BY ct.relevance_score DESC, ct.updated_at DESC`

	rows, err := a.db.Query(base, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]CompanyThemeView, 0)
	for rows.Next() {
		var row CompanyThemeView
		var isPrimary int64
		if err := rows.Scan(
			&row.ID, &row.CompanyID, &row.ThemeID,
			&row.TsCode, &row.CompanyName, &row.ThemeName,
			&row.RelevanceScore, &row.RoleInChain, &isPrimary, &row.EvidenceSum,
			&row.LatestThesis, &row.UpdatedAt,
		); err != nil {
			return nil, err
		}
		row.TsCode = displayTsCode(row.TsCode)
		row.IsPrimary = isPrimary == 1
		res = append(res, row)
	}
	return res, rows.Err()
}

func (a *App) CreateThesis(input ThesisInput) (Thesis, error) {
	if input.CompanyThemeID <= 0 {
		return Thesis{}, errors.New("company_theme_id is required")
	}
	if clean(input.ThesisTitle) == "" || clean(input.ThesisBody) == "" {
		return Thesis{}, errors.New("thesis_title and thesis_body are required")
	}

	tx, err := a.db.Begin()
	if err != nil {
		return Thesis{}, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	var maxVersion int64
	if err = tx.QueryRow(
		`SELECT COALESCE(MAX(thesis_version), 0) FROM investment_theses WHERE company_theme_id = ?`,
		input.CompanyThemeID,
	).Scan(&maxVersion); err != nil {
		return Thesis{}, err
	}

	confidence := clean(input.ConfidenceLevel)
	if confidence == "" {
		confidence = "medium"
	}
	author := clean(input.Author)
	if author == "" {
		author = "desktop-user"
	}

	result, err := tx.Exec(`
INSERT INTO investment_theses (
  company_theme_id, thesis_version, thesis_title, thesis_body, key_metrics,
  expected_timeline, confidence_level, status, author
)
VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
`,
		input.CompanyThemeID,
		maxVersion+1,
		clean(input.ThesisTitle),
		clean(input.ThesisBody),
		clean(input.KeyMetrics),
		clean(input.ExpectedTimeline),
		confidence,
		author,
	)
	if err != nil {
		return Thesis{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return Thesis{}, err
	}
	if err = tx.Commit(); err != nil {
		return Thesis{}, err
	}

	return a.getThesisByID(id)
}

func (a *App) getThesisByID(id int64) (Thesis, error) {
	var t Thesis
	err := a.db.QueryRow(`
SELECT id, company_theme_id, thesis_version, thesis_title, thesis_body, key_metrics,
       expected_timeline, confidence_level, status, author, created_at, updated_at
FROM investment_theses
WHERE id = ?
`, id).Scan(
		&t.ID, &t.CompanyThemeID, &t.ThesisVersion, &t.ThesisTitle, &t.ThesisBody, &t.KeyMetrics,
		&t.ExpectedTimeline, &t.ConfidenceLevel, &t.Status, &t.Author, &t.CreatedAt, &t.UpdatedAt,
	)
	return t, err
}

func (a *App) ListTheses(companyThemeID int64) ([]Thesis, error) {
	if companyThemeID <= 0 {
		return nil, errors.New("company_theme_id is required")
	}
	rows, err := a.db.Query(`
SELECT id, company_theme_id, thesis_version, thesis_title, thesis_body, key_metrics,
       expected_timeline, confidence_level, status, author, created_at, updated_at
FROM investment_theses
WHERE company_theme_id = ?
ORDER BY thesis_version DESC
`, companyThemeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]Thesis, 0)
	for rows.Next() {
		var t Thesis
		if err := rows.Scan(
			&t.ID, &t.CompanyThemeID, &t.ThesisVersion, &t.ThesisTitle, &t.ThesisBody, &t.KeyMetrics,
			&t.ExpectedTimeline, &t.ConfidenceLevel, &t.Status, &t.Author, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		res = append(res, t)
	}
	return res, rows.Err()
}

func (a *App) getThemeByID(id int64) (Theme, error) {
	var t Theme
	var pinned int64
	err := a.db.QueryRow(`
SELECT id, theme_name, theme_type, description, lifecycle_stage, heat_score, is_pinned_main, created_at, updated_at
FROM themes WHERE id = ?
`, id).Scan(
		&t.ID, &t.ThemeName, &t.ThemeType, &t.Description, &t.LifecycleStage, &t.HeatScore, &pinned, &t.CreatedAt, &t.UpdatedAt,
	)
	t.IsPinnedMain = pinned == 1
	return t, err
}

func (a *App) UpdateThemeMeta(input ThemeMetaUpdateInput) (Theme, error) {
	if input.ThemeID <= 0 {
		return Theme{}, errors.New("theme_id is required")
	}

	current, err := a.getThemeByID(input.ThemeID)
	if err != nil {
		return Theme{}, err
	}

	newHeat := input.HeatScore
	if newHeat < 0 {
		newHeat = current.HeatScore
	}
	if newHeat > 100 {
		newHeat = 100
	}
	newStage := clean(input.LifecycleStage)
	if newStage == "" {
		newStage = current.LifecycleStage
	}
	newPinned := input.IsPinnedMain

	changed := current.HeatScore != newHeat || current.LifecycleStage != newStage || current.IsPinnedMain != newPinned
	if !changed {
		return current, nil
	}

	tx, err := a.db.Begin()
	if err != nil {
		return Theme{}, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	pinnedInt := 0
	oldPinnedInt := 0
	if newPinned {
		pinnedInt = 1
	}
	if current.IsPinnedMain {
		oldPinnedInt = 1
	}

	if _, err = tx.Exec(`
UPDATE themes
SET heat_score = ?, lifecycle_stage = ?, is_pinned_main = ?, updated_at = datetime('now')
WHERE id = ?
`, newHeat, newStage, pinnedInt, input.ThemeID); err != nil {
		return Theme{}, err
	}

	operator := clean(input.Operator)
	if operator == "" {
		operator = "desktop-user"
	}
	if _, err = tx.Exec(`
INSERT INTO theme_change_logs (
  theme_id, old_heat_score, new_heat_score, old_lifecycle_stage, new_lifecycle_stage,
  old_is_pinned_main, new_is_pinned_main, change_note, operator
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, input.ThemeID, current.HeatScore, newHeat, current.LifecycleStage, newStage, oldPinnedInt, pinnedInt, clean(input.ChangeNote), operator); err != nil {
		return Theme{}, err
	}
	if err = tx.Commit(); err != nil {
		return Theme{}, err
	}
	return a.getThemeByID(input.ThemeID)
}

func (a *App) ListThemeChangeLogs(themeID int64) ([]ThemeChangeLog, error) {
	if themeID <= 0 {
		return nil, errors.New("theme_id is required")
	}
	rows, err := a.db.Query(`
SELECT id, theme_id, old_heat_score, new_heat_score, old_lifecycle_stage, new_lifecycle_stage,
       old_is_pinned_main, new_is_pinned_main, change_note, operator, created_at
FROM theme_change_logs
WHERE theme_id = ?
ORDER BY created_at DESC, id DESC
`, themeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]ThemeChangeLog, 0)
	for rows.Next() {
		var l ThemeChangeLog
		var oldPinned, newPinned int64
		if err := rows.Scan(
			&l.ID, &l.ThemeID, &l.OldHeatScore, &l.NewHeatScore, &l.OldLifecycleStage, &l.NewLifecycleStage,
			&oldPinned, &newPinned, &l.ChangeNote, &l.Operator, &l.CreatedAt,
		); err != nil {
			return nil, err
		}
		l.OldIsPinnedMain = oldPinned == 1
		l.NewIsPinnedMain = newPinned == 1
		res = append(res, l)
	}
	return res, rows.Err()
}

func (a *App) CreateThesisReview(input ThesisReviewInput) (ThesisReview, error) {
	if input.ThesisID <= 0 {
		return ThesisReview{}, errors.New("thesis_id is required")
	}
	if clean(input.ReviewDate) == "" || clean(input.ReviewResult) == "" {
		return ThesisReview{}, errors.New("review_date and review_result are required")
	}
	result, err := a.db.Exec(`
INSERT INTO thesis_reviews (thesis_id, review_date, review_result, pnl_hint, review_note)
VALUES (?, ?, ?, ?, ?)
`, input.ThesisID, clean(input.ReviewDate), clean(input.ReviewResult), clean(input.PnlHint), clean(input.ReviewNote))
	if err != nil {
		return ThesisReview{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return ThesisReview{}, err
	}
	return a.getThesisReviewByID(id)
}

func (a *App) getThesisReviewByID(id int64) (ThesisReview, error) {
	var r ThesisReview
	err := a.db.QueryRow(`
SELECT id, thesis_id, review_date, review_result, pnl_hint, review_note, created_at
FROM thesis_reviews
WHERE id = ?
`, id).Scan(&r.ID, &r.ThesisID, &r.ReviewDate, &r.ReviewResult, &r.PnlHint, &r.ReviewNote, &r.CreatedAt)
	return r, err
}

func (a *App) ListThesisReviews(thesisID int64) ([]ThesisReview, error) {
	if thesisID <= 0 {
		return nil, errors.New("thesis_id is required")
	}
	rows, err := a.db.Query(`
SELECT id, thesis_id, review_date, review_result, pnl_hint, review_note, created_at
FROM thesis_reviews
WHERE thesis_id = ?
ORDER BY review_date DESC, id DESC
`, thesisID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]ThesisReview, 0)
	for rows.Next() {
		var r ThesisReview
		if err := rows.Scan(&r.ID, &r.ThesisID, &r.ReviewDate, &r.ReviewResult, &r.PnlHint, &r.ReviewNote, &r.CreatedAt); err != nil {
			return nil, err
		}
		res = append(res, r)
	}
	return res, rows.Err()
}

func (a *App) GlobalSearch(query string) ([]GlobalSearchItem, error) {
	if clean(query) == "" {
		return []GlobalSearchItem{}, nil
	}
	like := "%" + clean(query) + "%"

	rows, err := a.db.Query(`
SELECT type, id, title, subtitle, target_view, company_theme_id, thesis_id
FROM (
	  SELECT
	    'company' AS type,
	    c.id AS id,
	    c.company_name AS title,
	    CASE WHEN c.ts_code LIKE 'AI.%' THEN '' ELSE c.ts_code END AS subtitle,
	    'companies' AS target_view,
	    0 AS company_theme_id,
	    0 AS thesis_id
  FROM companies c
  WHERE c.company_name LIKE ? OR c.ts_code LIKE ?

  UNION ALL

  SELECT
    'theme' AS type,
    t.id AS id,
    t.theme_name AS title,
    t.theme_type || ' · 热度 ' || CAST(t.heat_score AS TEXT) AS subtitle,
    'themes' AS target_view,
    0 AS company_theme_id,
    0 AS thesis_id
  FROM themes t
  WHERE t.theme_name LIKE ? OR t.description LIKE ?

  UNION ALL

	  SELECT
	    'mapping' AS type,
	    ct.id AS id,
	    c.company_name || ' / ' || t.theme_name AS title,
	    (CASE WHEN c.ts_code LIKE 'AI.%' THEN '' ELSE c.ts_code END) || ' · 相关性 ' || CAST(ct.relevance_score AS TEXT) AS subtitle,
	    'mapping' AS target_view,
	    ct.id AS company_theme_id,
	    0 AS thesis_id
  FROM company_themes ct
  JOIN companies c ON c.id = ct.company_id
  JOIN themes t ON t.id = ct.theme_id
  WHERE c.company_name LIKE ? OR c.ts_code LIKE ? OR t.theme_name LIKE ?

  UNION ALL

  SELECT
    'thesis' AS type,
    it.id AS id,
    it.thesis_title AS title,
    c.company_name || ' / ' || t.theme_name || ' · V' || CAST(it.thesis_version AS TEXT) AS subtitle,
    'thesis' AS target_view,
    it.company_theme_id AS company_theme_id,
    it.id AS thesis_id
  FROM investment_theses it
  JOIN company_themes ct ON ct.id = it.company_theme_id
  JOIN companies c ON c.id = ct.company_id
  JOIN themes t ON t.id = ct.theme_id
  WHERE it.thesis_title LIKE ? OR it.thesis_body LIKE ? OR c.company_name LIKE ? OR t.theme_name LIKE ?
)
ORDER BY type ASC, id DESC
LIMIT 40
`, like, like, like, like, like, like, like, like, like, like, like)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]GlobalSearchItem, 0)
	for rows.Next() {
		var item GlobalSearchItem
		if err := rows.Scan(&item.Type, &item.ID, &item.Title, &item.Subtitle, &item.TargetView, &item.CompanyThemeID, &item.ThesisID); err != nil {
			return nil, err
		}
		if item.Type == "mapping" && strings.HasPrefix(item.Subtitle, " · ") {
			item.Subtitle = strings.TrimPrefix(item.Subtitle, " · ")
		}
		res = append(res, item)
	}
	return res, rows.Err()
}

func displayTsCode(raw string) string {
	code := strings.ToUpper(clean(raw))
	if strings.HasPrefix(code, "AI.") {
		return ""
	}
	return clean(raw)
}
