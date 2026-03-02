package main

type Company struct {
	ID           int64  `json:"id"`
	TsCode       string `json:"ts_code"`
	CompanyName  string `json:"company_name"`
	IndustryL1   string `json:"industry_l1"`
	IndustryL2   string `json:"industry_l2"`
	ListingBoard string `json:"listing_board"`
	Status       string `json:"status"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

type Theme struct {
	ID             int64  `json:"id"`
	ThemeName      string `json:"theme_name"`
	ThemeType      string `json:"theme_type"`
	Description    string `json:"description"`
	LifecycleStage string `json:"lifecycle_stage"`
	HeatScore      int64  `json:"heat_score"`
	IsPinnedMain   bool   `json:"is_pinned_main"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

type CompanyThemeView struct {
	ID             int64  `json:"id"`
	CompanyID      int64  `json:"company_id"`
	ThemeID        int64  `json:"theme_id"`
	TsCode         string `json:"ts_code"`
	CompanyName    string `json:"company_name"`
	ThemeName      string `json:"theme_name"`
	RelevanceScore int64  `json:"relevance_score"`
	RoleInChain    string `json:"role_in_chain"`
	IsPrimary      bool   `json:"is_primary"`
	EvidenceSum    string `json:"evidence_summary"`
	LatestThesis   string `json:"latest_thesis_title"`
	UpdatedAt      string `json:"updated_at"`
}

type Thesis struct {
	ID               int64  `json:"id"`
	CompanyThemeID   int64  `json:"company_theme_id"`
	ThesisVersion    int64  `json:"thesis_version"`
	ThesisTitle      string `json:"thesis_title"`
	ThesisBody       string `json:"thesis_body"`
	KeyMetrics       string `json:"key_metrics"`
	ExpectedTimeline string `json:"expected_timeline"`
	ConfidenceLevel  string `json:"confidence_level"`
	Status           string `json:"status"`
	Author           string `json:"author"`
	CreatedAt        string `json:"created_at"`
	UpdatedAt        string `json:"updated_at"`
}

type ThesisReview struct {
	ID           int64  `json:"id"`
	ThesisID     int64  `json:"thesis_id"`
	ReviewDate   string `json:"review_date"`
	ReviewResult string `json:"review_result"`
	PnlHint      string `json:"pnl_hint"`
	ReviewNote   string `json:"review_note"`
	CreatedAt    string `json:"created_at"`
}

type ThemeChangeLog struct {
	ID                int64  `json:"id"`
	ThemeID           int64  `json:"theme_id"`
	OldHeatScore      int64  `json:"old_heat_score"`
	NewHeatScore      int64  `json:"new_heat_score"`
	OldLifecycleStage string `json:"old_lifecycle_stage"`
	NewLifecycleStage string `json:"new_lifecycle_stage"`
	OldIsPinnedMain   bool   `json:"old_is_pinned_main"`
	NewIsPinnedMain   bool   `json:"new_is_pinned_main"`
	ChangeNote        string `json:"change_note"`
	Operator          string `json:"operator"`
	CreatedAt         string `json:"created_at"`
}

type GlobalSearchItem struct {
	Type           string `json:"type"`
	ID             int64  `json:"id"`
	Title          string `json:"title"`
	Subtitle       string `json:"subtitle"`
	TargetView     string `json:"target_view"`
	CompanyThemeID int64  `json:"company_theme_id"`
	ThesisID       int64  `json:"thesis_id"`
}

type DashboardStats struct {
	CompanyCount     int64 `json:"company_count"`
	ThemeCount       int64 `json:"theme_count"`
	CompanyThemeRows int64 `json:"company_theme_rows"`
	ActiveThesisRows int64 `json:"active_thesis_rows"`
}

type CompanyInput struct {
	TsCode       string `json:"ts_code"`
	CompanyName  string `json:"company_name"`
	IndustryL1   string `json:"industry_l1"`
	IndustryL2   string `json:"industry_l2"`
	ListingBoard string `json:"listing_board"`
}

type CompanyUpdateInput struct {
	ID           int64  `json:"id"`
	TsCode       string `json:"ts_code"`
	CompanyName  string `json:"company_name"`
	IndustryL1   string `json:"industry_l1"`
	IndustryL2   string `json:"industry_l2"`
	ListingBoard string `json:"listing_board"`
}

type ThemeInput struct {
	ThemeName      string `json:"theme_name"`
	ThemeType      string `json:"theme_type"`
	Description    string `json:"description"`
	LifecycleStage string `json:"lifecycle_stage"`
	HeatScore      int64  `json:"heat_score"`
}

type ThemeMetaUpdateInput struct {
	ThemeID        int64  `json:"theme_id"`
	HeatScore      int64  `json:"heat_score"`
	LifecycleStage string `json:"lifecycle_stage"`
	IsPinnedMain   bool   `json:"is_pinned_main"`
	ChangeNote     string `json:"change_note"`
	Operator       string `json:"operator"`
}

type CompanyThemeInput struct {
	CompanyID      int64  `json:"company_id"`
	ThemeID        int64  `json:"theme_id"`
	RelevanceScore int64  `json:"relevance_score"`
	RoleInChain    string `json:"role_in_chain"`
	IsPrimary      bool   `json:"is_primary"`
	EvidenceSum    string `json:"evidence_summary"`
}

type ThesisInput struct {
	CompanyThemeID   int64  `json:"company_theme_id"`
	ThesisTitle      string `json:"thesis_title"`
	ThesisBody       string `json:"thesis_body"`
	KeyMetrics       string `json:"key_metrics"`
	ExpectedTimeline string `json:"expected_timeline"`
	ConfidenceLevel  string `json:"confidence_level"`
	Author           string `json:"author"`
}

type ThesisReviewInput struct {
	ThesisID     int64  `json:"thesis_id"`
	ReviewDate   string `json:"review_date"`
	ReviewResult string `json:"review_result"`
	PnlHint      string `json:"pnl_hint"`
	ReviewNote   string `json:"review_note"`
}

type AISettings struct {
	BaseURL          string       `json:"base_url"`
	APIKey           string       `json:"api_key"`
	Model            string       `json:"model"`
	SystemPrompt     string       `json:"system_prompt"`
	Providers        []AIProvider `json:"providers"`
	ActiveProviderID string       `json:"active_provider_id"`
}

type AIProvider struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	BaseURL      string `json:"base_url"`
	APIKey       string `json:"api_key"`
	Model        string `json:"model"`
	SystemPrompt string `json:"system_prompt"`
	RequestMode  string `json:"request_mode"`
}

type AIFileInput struct {
	FileName   string `json:"file_name"`
	MimeType   string `json:"mime_type"`
	Base64Data string `json:"base64_data"`
}

type AIParseInput struct {
	UserText        string        `json:"user_text"`
	Files           []AIFileInput `json:"files"`
	Temperature     float64       `json:"temperature"`
	MaxOutputTokens int64         `json:"max_output_tokens"`
	ProviderID      string        `json:"provider_id"`
}

type AIParseResult struct {
	Summary        string `json:"summary"`
	RawResponse    string `json:"raw_response"`
	StructuredJSON string `json:"structured_json"`
	Model          string `json:"model"`
	Provider       string `json:"provider"`
}

type AIImportCompany struct {
	TsCode       string `json:"ts_code"`
	CompanyName  string `json:"company_name"`
	IndustryL1   string `json:"industry_l1"`
	IndustryL2   string `json:"industry_l2"`
	ListingBoard string `json:"listing_board"`
}

type AIImportTheme struct {
	ThemeName      string `json:"theme_name"`
	ThemeType      string `json:"theme_type"`
	Description    string `json:"description"`
	LifecycleStage string `json:"lifecycle_stage"`
	HeatScore      int64  `json:"heat_score"`
}

type AIImportMapping struct {
	TsCode         string `json:"ts_code"`
	CompanyName    string `json:"company_name"`
	ThemeName      string `json:"theme_name"`
	RelevanceScore int64  `json:"relevance_score"`
	RoleInChain    string `json:"role_in_chain"`
	IsPrimary      bool   `json:"is_primary"`
	EvidenceSum    string `json:"evidence_summary"`
}

type AIImportThesis struct {
	TsCode           string `json:"ts_code"`
	CompanyName      string `json:"company_name"`
	ThemeName        string `json:"theme_name"`
	ThesisTitle      string `json:"thesis_title"`
	ThesisBody       string `json:"thesis_body"`
	KeyMetrics       string `json:"key_metrics"`
	ExpectedTimeline string `json:"expected_timeline"`
	ConfidenceLevel  string `json:"confidence_level"`
}

type AIImportPayload struct {
	Companies []AIImportCompany `json:"companies"`
	Themes    []AIImportTheme   `json:"themes"`
	Mappings  []AIImportMapping `json:"mappings"`
	Thesis    AIImportThesis    `json:"thesis"`
}

type AIImportValidationInput struct {
	JSONPayload string `json:"json_payload"`
}

type AIImportValidation struct {
	IsValid         bool     `json:"is_valid"`
	Errors          []string `json:"errors"`
	Warnings        []string `json:"warnings"`
	NormalizedJSON  string   `json:"normalized_json"`
	EstimatedWrites int64    `json:"estimated_writes"`
}

type AIImportInput struct {
	JSONPayload     string        `json:"json_payload"`
	Files           []AIFileInput `json:"files"`
	SaveAttachments bool          `json:"save_attachments"`
	AttachmentNote  string        `json:"attachment_note"`
}

type AIImportResult struct {
	CreatedCompanies int64    `json:"created_companies"`
	CreatedThemes    int64    `json:"created_themes"`
	UpsertedMappings int64    `json:"upserted_mappings"`
	CreatedTheses    int64    `json:"created_theses"`
	SavedAttachments int64    `json:"saved_attachments"`
	Warnings         []string `json:"warnings"`
}

type Attachment struct {
	ID        int64  `json:"id"`
	ScopeType string `json:"scope_type"`
	ScopeID   int64  `json:"scope_id"`
	FileName  string `json:"file_name"`
	MimeType  string `json:"mime_type"`
	FileSize  int64  `json:"file_size"`
	Note      string `json:"note"`
	CreatedAt string `json:"created_at"`
}

type AttachmentInput struct {
	ScopeType string        `json:"scope_type"`
	ScopeID   int64         `json:"scope_id"`
	Note      string        `json:"note"`
	Files     []AIFileInput `json:"files"`
}

type AttachmentListInput struct {
	ScopeType string `json:"scope_type"`
	ScopeID   int64  `json:"scope_id"`
	Query     string `json:"query"`
}

type AttachmentPreview struct {
	ID          int64  `json:"id"`
	FileName    string `json:"file_name"`
	MimeType    string `json:"mime_type"`
	DataURL     string `json:"data_url"`
	TextPreview string `json:"text_preview"`
}
