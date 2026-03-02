package main

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

func (a *App) ValidateAIImport(input AIImportValidationInput) (AIImportValidation, error) {
	payload, normalized, err := parseAIImportPayload(input.JSONPayload)
	if err != nil {
		return AIImportValidation{
			IsValid:  false,
			Errors:   []string{err.Error()},
			Warnings: []string{},
		}, nil
	}

	errorsList, warnings, estimate := validateAIImportPayload(payload)
	return AIImportValidation{
		IsValid:         len(errorsList) == 0,
		Errors:          errorsList,
		Warnings:        warnings,
		NormalizedJSON:  normalized,
		EstimatedWrites: estimate,
	}, nil
}

func (a *App) ImportAIParseResult(input AIImportInput) (AIImportResult, error) {
	payload, _, err := parseAIImportPayload(input.JSONPayload)
	if err != nil {
		return AIImportResult{}, err
	}
	errorsList, warnings, _ := validateAIImportPayload(payload)
	if len(errorsList) > 0 {
		return AIImportResult{}, errors.New(strings.Join(errorsList, "；"))
	}

	tx, err := a.db.Begin()
	if err != nil {
		return AIImportResult{}, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	res := AIImportResult{
		Warnings: warnings,
	}

	companyByCode := map[string]int64{}
	companyByName := map[string]int64{}
	themeByName := map[string]int64{}
	var firstThemeID int64
	var firstMappingID int64
	var thesisID int64

	for _, c := range payload.Companies {
		id, created, upsertErr := upsertCompanyTx(tx, c)
		if upsertErr != nil {
			err = upsertErr
			return AIImportResult{}, err
		}
		if created {
			res.CreatedCompanies++
		}
		if clean(c.TsCode) != "" {
			companyByCode[normalizeCode(c.TsCode)] = id
		}
		if clean(c.CompanyName) != "" {
			companyByName[clean(c.CompanyName)] = id
		}
	}

	for _, t := range payload.Themes {
		id, created, upsertErr := upsertThemeTx(tx, t)
		if upsertErr != nil {
			err = upsertErr
			return AIImportResult{}, err
		}
		if firstThemeID == 0 {
			firstThemeID = id
		}
		if created {
			res.CreatedThemes++
		}
		themeByName[clean(t.ThemeName)] = id
	}

	for _, m := range payload.Mappings {
		companyID, findErr := findOrCreateCompanyForMappingTx(tx, m, companyByCode, companyByName)
		if findErr != nil {
			err = findErr
			return AIImportResult{}, err
		}
		if companyID == 0 {
			continue
		}

		themeID, findErr := findOrCreateThemeForMappingTx(tx, m, themeByName)
		if findErr != nil {
			err = findErr
			return AIImportResult{}, err
		}
		if themeID == 0 {
			continue
		}
		if firstThemeID == 0 {
			firstThemeID = themeID
		}

		mappingID, upsertErr := upsertCompanyThemeTx(tx, CompanyThemeInput{
			CompanyID:      companyID,
			ThemeID:        themeID,
			RelevanceScore: m.RelevanceScore,
			RoleInChain:    m.RoleInChain,
			IsPrimary:      m.IsPrimary,
			EvidenceSum:    m.EvidenceSum,
		})
		if upsertErr != nil {
			err = upsertErr
			return AIImportResult{}, err
		}
		res.UpsertedMappings++
		if firstMappingID == 0 {
			firstMappingID = mappingID
		}
	}

	if clean(payload.Thesis.ThesisTitle) != "" && clean(payload.Thesis.ThesisBody) != "" {
		companyID := resolveCompanyID(companyByCode, companyByName, payload.Thesis.TsCode, payload.Thesis.CompanyName)
		themeID := resolveThemeID(themeByName, payload.Thesis.ThemeName)
		if companyID > 0 && themeID > 0 {
			mappingID, mapErr := upsertCompanyThemeTx(tx, CompanyThemeInput{
				CompanyID:      companyID,
				ThemeID:        themeID,
				RelevanceScore: 70,
				RoleInChain:    "核心标的",
				IsPrimary:      true,
				EvidenceSum:    "AI导入自动建立",
			})
			if mapErr != nil {
				err = mapErr
				return AIImportResult{}, err
			}
			if firstMappingID == 0 {
				firstMappingID = mappingID
			}
			thesisID, err = createThesisTx(tx, ThesisInput{
				CompanyThemeID:   mappingID,
				ThesisTitle:      payload.Thesis.ThesisTitle,
				ThesisBody:       payload.Thesis.ThesisBody,
				KeyMetrics:       payload.Thesis.KeyMetrics,
				ExpectedTimeline: payload.Thesis.ExpectedTimeline,
				ConfidenceLevel:  payload.Thesis.ConfidenceLevel,
				Author:           "ai-import",
			})
			if err != nil {
				return AIImportResult{}, err
			}
			res.CreatedTheses++
		} else {
			res.Warnings = append(res.Warnings, "逻辑版本未落库：缺少可匹配的公司或题材")
		}
	}

	if input.SaveAttachments && len(input.Files) > 0 {
		scopeType := "general"
		scopeID := int64(0)
		if thesisID > 0 {
			scopeType = "thesis"
			scopeID = thesisID
		} else if firstThemeID > 0 {
			scopeType = "theme"
			scopeID = firstThemeID
		} else if firstMappingID > 0 {
			scopeType = "company_theme"
			scopeID = firstMappingID
		}
		saved, saveErr := saveAttachmentsTx(tx, AttachmentInput{
			ScopeType: scopeType,
			ScopeID:   scopeID,
			Note:      clean(input.AttachmentNote),
			Files:     input.Files,
		})
		if saveErr != nil {
			err = saveErr
			return AIImportResult{}, err
		}
		res.SavedAttachments = int64(saved)
	}

	if err = tx.Commit(); err != nil {
		return AIImportResult{}, err
	}
	return res, nil
}

func (a *App) SaveAttachments(input AttachmentInput) ([]Attachment, error) {
	tx, err := a.db.Begin()
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	items, err := saveAttachmentsRowsTx(tx, input)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return items, nil
}

func (a *App) ListAttachments(input AttachmentListInput) ([]Attachment, error) {
	query := `
SELECT id, scope_type, scope_id, file_name, mime_type, file_size, note, created_at
FROM ai_attachments
WHERE 1=1
`
	args := make([]any, 0, 3)
	if clean(input.ScopeType) != "" {
		query += ` AND scope_type = ?`
		args = append(args, clean(input.ScopeType))
	}
	if input.ScopeID > 0 {
		query += ` AND scope_id = ?`
		args = append(args, input.ScopeID)
	}
	if clean(input.Query) != "" {
		like := "%" + clean(input.Query) + "%"
		query += ` AND (file_name LIKE ? OR note LIKE ?)`
		args = append(args, like, like)
	}
	query += ` ORDER BY created_at DESC, id DESC LIMIT 200`

	rows, err := a.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res := make([]Attachment, 0)
	for rows.Next() {
		var item Attachment
		if err := rows.Scan(&item.ID, &item.ScopeType, &item.ScopeID, &item.FileName, &item.MimeType, &item.FileSize, &item.Note, &item.CreatedAt); err != nil {
			return nil, err
		}
		res = append(res, item)
	}
	return res, rows.Err()
}

func (a *App) GetAttachmentPreview(id int64) (AttachmentPreview, error) {
	if id <= 0 {
		return AttachmentPreview{}, errors.New("id is required")
	}
	var p AttachmentPreview
	var b []byte
	err := a.db.QueryRow(`
SELECT id, file_name, mime_type, file_data
FROM ai_attachments
WHERE id = ?
`, id).Scan(&p.ID, &p.FileName, &p.MimeType, &b)
	if err != nil {
		return AttachmentPreview{}, err
	}
	if strings.HasPrefix(p.MimeType, "text/") || strings.Contains(p.MimeType, "json") || strings.Contains(p.MimeType, "markdown") {
		s := strings.TrimSpace(string(b))
		if len(s) > 12000 {
			s = s[:12000] + "\n...(truncated)"
		}
		p.TextPreview = s
		return p, nil
	}
	p.DataURL = fmt.Sprintf("data:%s;base64,%s", p.MimeType, base64.StdEncoding.EncodeToString(b))
	return p, nil
}

func parseAIImportPayload(raw string) (AIImportPayload, string, error) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return AIImportPayload{}, "", errors.New("结构化 JSON 不能为空")
	}
	if !json.Valid([]byte(text)) {
		text = extractLikelyJSONObject(text)
	}
	if !json.Valid([]byte(text)) {
		return AIImportPayload{}, "", errors.New("结构化 JSON 格式不合法")
	}

	var root any
	if err := json.Unmarshal([]byte(text), &root); err != nil {
		return AIImportPayload{}, "", err
	}

	rootObj, ok := root.(map[string]any)
	if !ok {
		return AIImportPayload{}, "", errors.New("结构化 JSON 顶层必须是对象")
	}

	payload := normalizeAIImportPayload(rootObj)
	if payload.Companies == nil {
		payload.Companies = []AIImportCompany{}
	}
	if payload.Themes == nil {
		payload.Themes = []AIImportTheme{}
	}
	if payload.Mappings == nil {
		payload.Mappings = []AIImportMapping{}
	}
	normalizedBytes, _ := json.MarshalIndent(payload, "", "  ")
	return payload, string(normalizedBytes), nil
}

func normalizeAIImportPayload(root map[string]any) AIImportPayload {
	payload := AIImportPayload{
		Companies: []AIImportCompany{},
		Themes:    []AIImportTheme{},
		Mappings:  []AIImportMapping{},
	}

	themes := asObjectArray(firstValue(root, "themes", "theme_list", "topic_list"))
	for _, item := range themes {
		name := pickString(item, "theme_name", "name", "theme", "title")
		if name == "" {
			continue
		}
		payload.Themes = append(payload.Themes, AIImportTheme{
			ThemeName:      name,
			ThemeType:      defaultString(pickString(item, "theme_type", "type"), "concept"),
			Description:    pickString(item, "description", "definition", "desc"),
			LifecycleStage: normalizeLifecycleStage(pickString(item, "lifecycle_stage", "stage", "stage_judgement")),
			HeatScore:      pickInt64(item, "heat_score", "heat", "score"),
		})
	}

	themeByName := make(map[string]struct{}, len(payload.Themes))
	for _, t := range payload.Themes {
		themeByName[clean(t.ThemeName)] = struct{}{}
	}

	companies := asObjectArray(firstValue(root, "companies", "stocks", "targets"))
	for _, item := range companies {
		companyName := pickString(item, "company_name", "name", "company", "简称")
		tsCode := pickString(item, "ts_code", "code", "ticker", "symbol")
		if companyName == "" && tsCode == "" {
			continue
		}
		payload.Companies = append(payload.Companies, AIImportCompany{
			TsCode:       tsCode,
			CompanyName:  companyName,
			IndustryL1:   pickString(item, "industry_l1", "industry"),
			IndustryL2:   pickString(item, "industry_l2", "sub_industry"),
			ListingBoard: pickString(item, "listing_board", "board"),
		})

		if hint := pickString(item, "theme", "themes", "topic", "题材"); hint != "" && companyName != "" {
			for _, themeName := range splitMultiValues(hint) {
				if themeName == "" {
					continue
				}
				if _, ok := themeByName[themeName]; !ok {
					payload.Themes = append(payload.Themes, AIImportTheme{
						ThemeName:      themeName,
						ThemeType:      "concept",
						Description:    "",
						LifecycleStage: "",
						HeatScore:      0,
					})
					themeByName[themeName] = struct{}{}
				}
				payload.Mappings = append(payload.Mappings, AIImportMapping{
					TsCode:         tsCode,
					CompanyName:    companyName,
					ThemeName:      themeName,
					RelevanceScore: 70,
					RoleInChain:    "核心标的",
					IsPrimary:      false,
					EvidenceSum:    pickString(item, "note", "remark"),
				})
			}
		}
	}

	mappings := asObjectArray(firstValue(root, "mappings", "relations", "company_theme_mappings", "links"))
	for _, item := range mappings {
		themeName := pickString(item, "theme_name", "theme", "topic")
		companyName := pickString(item, "company_name", "company", "name")
		tsCode := pickString(item, "ts_code", "code", "ticker")
		if themeName == "" || (companyName == "" && tsCode == "") {
			continue
		}
		payload.Mappings = append(payload.Mappings, AIImportMapping{
			TsCode:         tsCode,
			CompanyName:    companyName,
			ThemeName:      themeName,
			RelevanceScore: pickInt64(item, "relevance_score", "score", "weight"),
			RoleInChain:    pickString(item, "role_in_chain", "role"),
			IsPrimary:      pickBool(item, "is_primary", "primary"),
			EvidenceSum:    pickString(item, "evidence_summary", "logic_tag", "logic", "note", "reason"),
		})
	}

	payload.Mappings = dedupeMappings(payload.Mappings)

	thesisObj := asObject(firstValue(root, "thesis", "investment_thesis", "view"))
	if thesisObj != nil {
		payload.Thesis = AIImportThesis{
			TsCode:           pickString(thesisObj, "ts_code", "code", "ticker"),
			CompanyName:      pickString(thesisObj, "company_name", "company", "name"),
			ThemeName:        pickString(thesisObj, "theme_name", "theme", "topic"),
			ThesisTitle:      pickString(thesisObj, "thesis_title", "title"),
			ThesisBody:       pickString(thesisObj, "thesis_body", "body", "logic"),
			KeyMetrics:       anyToText(firstValue(thesisObj, "key_metrics", "metrics", "key_indicators", "key_metric")),
			ExpectedTimeline: pickString(thesisObj, "expected_timeline", "timeline", "period"),
			ConfidenceLevel:  normalizeConfidenceLevel(pickString(thesisObj, "confidence_level", "confidence", "信心")),
		}
	}

	return payload
}

func firstValue(obj map[string]any, keys ...string) any {
	for _, k := range keys {
		if v, ok := obj[k]; ok {
			return v
		}
	}
	return nil
}

func asObject(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func asObjectArray(v any) []map[string]any {
	list, ok := v.([]any)
	if !ok {
		return []map[string]any{}
	}
	res := make([]map[string]any, 0, len(list))
	for _, item := range list {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		res = append(res, obj)
	}
	return res
}

func pickString(obj map[string]any, keys ...string) string {
	v := firstValue(obj, keys...)
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return clean(t)
	case float64:
		return clean(strconv.FormatFloat(t, 'f', -1, 64))
	case bool:
		if t {
			return "true"
		}
		return "false"
	default:
		return clean(anyToText(v))
	}
}

func pickInt64(obj map[string]any, keys ...string) int64 {
	v := firstValue(obj, keys...)
	switch t := v.(type) {
	case float64:
		return int64(t)
	case int64:
		return t
	case int:
		return int64(t)
	case string:
		s := clean(t)
		if s == "" {
			return 0
		}
		if i, err := strconv.ParseInt(s, 10, 64); err == nil {
			return i
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return int64(f)
		}
	}
	return 0
}

func pickBool(obj map[string]any, keys ...string) bool {
	v := firstValue(obj, keys...)
	switch t := v.(type) {
	case bool:
		return t
	case float64:
		return t != 0
	case int64:
		return t != 0
	case int:
		return t != 0
	case string:
		s := strings.ToLower(clean(t))
		return s == "1" || s == "true" || s == "yes" || s == "y" || s == "是"
	}
	return false
}

func anyToText(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return clean(t)
	case float64:
		return clean(strconv.FormatFloat(t, 'f', -1, 64))
	case bool:
		if t {
			return "true"
		}
		return "false"
	case []any:
		parts := make([]string, 0, len(t))
		for _, item := range t {
			s := anyToText(item)
			if s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, "\n")
	case map[string]any:
		b, _ := json.Marshal(t)
		return string(b)
	default:
		return ""
	}
}

func splitMultiValues(s string) []string {
	raw := clean(s)
	if raw == "" {
		return []string{}
	}
	replacer := strings.NewReplacer("，", ",", "、", ",", "/", ",", "|", ",", "；", ",", ";", ",")
	raw = replacer.Replace(raw)
	items := strings.Split(raw, ",")
	res := make([]string, 0, len(items))
	for _, item := range items {
		v := clean(item)
		if v != "" {
			res = append(res, v)
		}
	}
	return res
}

func normalizeLifecycleStage(s string) string {
	v := strings.ToLower(clean(s))
	switch v {
	case "", "-":
		return ""
	case "early", "早期", "启动":
		return "early"
	case "growth", "成长", "扩散":
		return "growth"
	case "mature", "成熟":
		return "mature"
	case "decline", "衰退":
		return "decline"
	default:
		return clean(s)
	}
}

func normalizeConfidenceLevel(s string) string {
	v := strings.ToLower(clean(s))
	switch v {
	case "high", "高", "较高":
		return "high"
	case "low", "低", "较低":
		return "low"
	case "medium", "中", "中等", "":
		return "medium"
	default:
		return v
	}
}

func dedupeMappings(items []AIImportMapping) []AIImportMapping {
	seen := make(map[string]struct{}, len(items))
	res := make([]AIImportMapping, 0, len(items))
	for _, item := range items {
		company := clean(item.CompanyName)
		code := normalizeCode(item.TsCode)
		theme := clean(item.ThemeName)
		key := strings.ToLower(code + "|" + company + "|" + theme)
		if key == "||" || theme == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		res = append(res, item)
	}
	return res
}

func validateAIImportPayload(payload AIImportPayload) ([]string, []string, int64) {
	errorsList := make([]string, 0)
	warnings := make([]string, 0)
	estimate := int64(0)

	companyNameSet := map[string]struct{}{}
	companyCodeSet := map[string]struct{}{}
	for i, c := range payload.Companies {
		name := clean(c.CompanyName)
		if name == "" {
			errorsList = append(errorsList, fmt.Sprintf("companies[%d].company_name 不能为空", i))
		}
		if name != "" {
			if _, ok := companyNameSet[name]; ok {
				warnings = append(warnings, fmt.Sprintf("companies[%d] 公司名重复: %s", i, name))
			}
			companyNameSet[name] = struct{}{}
		}
		if clean(c.TsCode) == "" {
			warnings = append(warnings, fmt.Sprintf("companies[%d] 缺少 ts_code，入库将按公司名匹配", i))
		} else {
			code := normalizeCode(c.TsCode)
			if _, ok := companyCodeSet[code]; ok {
				warnings = append(warnings, fmt.Sprintf("companies[%d] 证券代码重复: %s", i, code))
			}
			companyCodeSet[code] = struct{}{}
		}
		estimate++
	}

	themeNameSet := map[string]struct{}{}
	for i, t := range payload.Themes {
		name := clean(t.ThemeName)
		if name == "" {
			errorsList = append(errorsList, fmt.Sprintf("themes[%d].theme_name 不能为空", i))
			continue
		}
		if _, ok := themeNameSet[name]; ok {
			warnings = append(warnings, fmt.Sprintf("themes[%d] 题材名重复: %s", i, name))
		}
		themeNameSet[name] = struct{}{}
		estimate++
	}

	for i, m := range payload.Mappings {
		if clean(m.ThemeName) == "" {
			errorsList = append(errorsList, fmt.Sprintf("mappings[%d].theme_name 不能为空", i))
		}
		if clean(m.TsCode) == "" && clean(m.CompanyName) == "" {
			errorsList = append(errorsList, fmt.Sprintf("mappings[%d] 至少要有 ts_code 或 company_name", i))
		}
		if m.RelevanceScore < 0 || m.RelevanceScore > 100 {
			warnings = append(warnings, fmt.Sprintf("mappings[%d].relevance_score 建议 0-100，已自动截断", i))
		}
		estimate++
	}

	th := payload.Thesis
	if clean(th.ThesisTitle) != "" || clean(th.ThesisBody) != "" {
		if clean(th.ThesisTitle) == "" || clean(th.ThesisBody) == "" {
			errorsList = append(errorsList, "thesis.thesis_title 与 thesis.thesis_body 需要同时存在")
		}
		if clean(th.ThemeName) == "" || (clean(th.TsCode) == "" && clean(th.CompanyName) == "") {
			warnings = append(warnings, "thesis 缺少定位字段（theme_name + ts_code/company_name），将跳过逻辑版本入库")
		}
		if strings.EqualFold(clean(th.ConfidenceLevel), "low") {
			warnings = append(warnings, "thesis.confidence_level=low，建议人工复核后再入库")
		}
		estimate++
	}

	return errorsList, warnings, estimate
}

func upsertCompanyTx(tx *sql.Tx, input AIImportCompany) (int64, bool, error) {
	code := normalizeCode(input.TsCode)
	name := clean(input.CompanyName)
	if name == "" {
		return 0, false, nil
	}
	if code != "" {
		var id int64
		err := tx.QueryRow(`SELECT id FROM companies WHERE ts_code = ?`, code).Scan(&id)
		if err == nil {
			return id, false, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return 0, false, err
		}
		res, err := tx.Exec(`
INSERT INTO companies (ts_code, company_name, industry_l1, industry_l2, listing_board, status)
VALUES (?, ?, ?, ?, ?, 'active')
`, code, name, clean(input.IndustryL1), clean(input.IndustryL2), defaultString(clean(input.ListingBoard), "主板"))
		if err != nil {
			return 0, false, err
		}
		id, err = res.LastInsertId()
		return id, true, err
	}

	var id int64
	err := tx.QueryRow(`SELECT id FROM companies WHERE company_name = ? ORDER BY id DESC LIMIT 1`, name).Scan(&id)
	if err == nil {
		return id, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}
	code = fmt.Sprintf("AI.%s", name)
	res, err := tx.Exec(`
INSERT INTO companies (ts_code, company_name, industry_l1, industry_l2, listing_board, status)
VALUES (?, ?, ?, ?, ?, 'active')
`, code, name, clean(input.IndustryL1), clean(input.IndustryL2), defaultString(clean(input.ListingBoard), "主板"))
	if err != nil {
		return 0, false, err
	}
	id, err = res.LastInsertId()
	return id, true, err
}

func upsertThemeTx(tx *sql.Tx, input AIImportTheme) (int64, bool, error) {
	name := clean(input.ThemeName)
	if name == "" {
		return 0, false, nil
	}
	var id int64
	err := tx.QueryRow(`SELECT id FROM themes WHERE theme_name = ?`, name).Scan(&id)
	if err == nil {
		return id, false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}
	heat := input.HeatScore
	if heat <= 0 {
		heat = 60
	}
	if heat > 100 {
		heat = 100
	}
	res, err := tx.Exec(`
INSERT INTO themes (theme_name, theme_type, description, lifecycle_stage, heat_score, is_pinned_main)
VALUES (?, ?, ?, ?, ?, 0)
`, name, defaultString(clean(input.ThemeType), "concept"), clean(input.Description), defaultString(clean(input.LifecycleStage), "growth"), heat)
	if err != nil {
		return 0, false, err
	}
	id, err = res.LastInsertId()
	return id, true, err
}

func findOrCreateCompanyForMappingTx(tx *sql.Tx, m AIImportMapping, byCode map[string]int64, byName map[string]int64) (int64, error) {
	if id := resolveCompanyID(byCode, byName, m.TsCode, m.CompanyName); id > 0 {
		return id, nil
	}
	id, created, err := upsertCompanyTx(tx, AIImportCompany{
		TsCode:      m.TsCode,
		CompanyName: m.CompanyName,
	})
	if err != nil {
		return 0, err
	}
	if created || id > 0 {
		if clean(m.TsCode) != "" {
			byCode[normalizeCode(m.TsCode)] = id
		}
		if clean(m.CompanyName) != "" {
			byName[clean(m.CompanyName)] = id
		}
	}
	return id, nil
}

func findOrCreateThemeForMappingTx(tx *sql.Tx, m AIImportMapping, byName map[string]int64) (int64, error) {
	name := clean(m.ThemeName)
	if name == "" {
		return 0, nil
	}
	if id, ok := byName[name]; ok {
		return id, nil
	}
	id, _, err := upsertThemeTx(tx, AIImportTheme{
		ThemeName: name,
	})
	if err != nil {
		return 0, err
	}
	byName[name] = id
	return id, nil
}

func upsertCompanyThemeTx(tx *sql.Tx, input CompanyThemeInput) (int64, error) {
	score := input.RelevanceScore
	if score <= 0 {
		score = 70
	}
	if score > 100 {
		score = 100
	}
	isPrimary := 0
	if input.IsPrimary {
		isPrimary = 1
	}
	_, err := tx.Exec(`
INSERT INTO company_themes (company_id, theme_id, relevance_score, role_in_chain, is_primary, evidence_summary)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(company_id, theme_id) DO UPDATE SET
  relevance_score=excluded.relevance_score,
  role_in_chain=excluded.role_in_chain,
  is_primary=excluded.is_primary,
  evidence_summary=excluded.evidence_summary,
  updated_at=datetime('now')
`, input.CompanyID, input.ThemeID, score, defaultString(clean(input.RoleInChain), "核心标的"), isPrimary, clean(input.EvidenceSum))
	if err != nil {
		return 0, err
	}
	var id int64
	if err := tx.QueryRow(`SELECT id FROM company_themes WHERE company_id = ? AND theme_id = ?`, input.CompanyID, input.ThemeID).Scan(&id); err != nil {
		return 0, err
	}
	return id, nil
}

func createThesisTx(tx *sql.Tx, input ThesisInput) (int64, error) {
	var maxVersion int64
	if err := tx.QueryRow(`SELECT COALESCE(MAX(thesis_version), 0) FROM investment_theses WHERE company_theme_id = ?`, input.CompanyThemeID).Scan(&maxVersion); err != nil {
		return 0, err
	}
	res, err := tx.Exec(`
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
		defaultString(clean(input.ConfidenceLevel), "medium"),
		defaultString(clean(input.Author), "ai-import"),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func saveAttachmentsTx(tx *sql.Tx, input AttachmentInput) (int, error) {
	items, err := saveAttachmentsRowsTx(tx, input)
	if err != nil {
		return 0, err
	}
	return len(items), nil
}

func saveAttachmentsRowsTx(tx *sql.Tx, input AttachmentInput) ([]Attachment, error) {
	scopeType := clean(input.ScopeType)
	if scopeType == "" {
		scopeType = "general"
	}
	note := clean(input.Note)
	res := make([]Attachment, 0, len(input.Files))
	for _, f := range input.Files {
		if clean(f.Base64Data) == "" {
			continue
		}
		blob, err := base64.StdEncoding.DecodeString(f.Base64Data)
		if err != nil {
			return nil, err
		}
		name := safeFilename(f.FileName)
		mimeType := normalizeMimeType(name, f.MimeType)
		dbRes, err := tx.Exec(`
INSERT INTO ai_attachments (scope_type, scope_id, file_name, mime_type, file_size, file_data, note)
VALUES (?, ?, ?, ?, ?, ?, ?)
`, scopeType, input.ScopeID, name, mimeType, len(blob), blob, note)
		if err != nil {
			return nil, err
		}
		id, err := dbRes.LastInsertId()
		if err != nil {
			return nil, err
		}
		row := Attachment{}
		if err := tx.QueryRow(`
SELECT id, scope_type, scope_id, file_name, mime_type, file_size, note, created_at
FROM ai_attachments WHERE id = ?
`, id).Scan(&row.ID, &row.ScopeType, &row.ScopeID, &row.FileName, &row.MimeType, &row.FileSize, &row.Note, &row.CreatedAt); err != nil {
			return nil, err
		}
		res = append(res, row)
	}
	return res, nil
}

func resolveCompanyID(byCode map[string]int64, byName map[string]int64, tsCode string, companyName string) int64 {
	if clean(tsCode) != "" {
		if id, ok := byCode[normalizeCode(tsCode)]; ok {
			return id
		}
	}
	if clean(companyName) != "" {
		if id, ok := byName[clean(companyName)]; ok {
			return id
		}
	}
	return 0
}

func resolveThemeID(byName map[string]int64, themeName string) int64 {
	if clean(themeName) == "" {
		return 0
	}
	return byName[clean(themeName)]
}

func normalizeCode(s string) string {
	code := strings.ToUpper(clean(s))
	if code == "" {
		return ""
	}
	if isPlaceholderCode(code) {
		return ""
	}
	if strings.Contains(code, ".") {
		return code
	}
	if len(code) == 6 {
		allDigits := true
		for _, ch := range code {
			if ch < '0' || ch > '9' {
				allDigits = false
				break
			}
		}
		if allDigits {
			switch code[0] {
			case '5', '6', '9':
				return code + ".SH"
			default:
				return code + ".SZ"
			}
		}
	}
	return code
}

func isPlaceholderCode(code string) bool {
	c := strings.ToUpper(clean(code))
	if c == "" {
		return true
	}
	// 常见“占位/未知”写法，不应参与证券代码去重或入库匹配。
	placeholders := map[string]struct{}{
		"待补充信息": {},
		"待补充":   {},
		"未知":    {},
		"无":     {},
		"N/A":   {},
		"NA":    {},
		"NONE":  {},
		"NULL":  {},
		"TBD":   {},
		"-":     {},
		"--":    {},
	}
	if _, ok := placeholders[c]; ok {
		return true
	}
	return strings.Contains(c, "待补充")
}

func defaultString(v string, fallback string) string {
	if clean(v) == "" {
		return fallback
	}
	return clean(v)
}
