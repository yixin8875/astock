package main

import (
	"bufio"
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	defaultAIBaseURL = "https://api.openai.com/v1"
	defaultAIModel   = "gpt-4.1"
	defaultProvider  = "default"
	modeChat         = "chat"
	modeResponses    = "responses"
)

const defaultAISystemPrompt = `你是A股题材研究助手。请从用户提供的文本、图片、PDF中抽取并整理：
1) 题材名称与定义
2) 涉及公司与代码（若有）
3) 投资逻辑链路（触发因素 -> 传导 -> 业绩/估值）
4) 催化剂与验证指标
5) 风险点
6) 结论（短中期观点）

输出要求：
- 先给简明中文结论（不超过8条）
- 再给“可落地结构化数据（JSON）”，字段建议：
  themes[], companies[], mappings[], thesis{title,body,key_metrics,expected_timeline,confidence_level}, risks[], catalysts[]
- 如果信息不足，请明确标注“待补充信息”。`

type apiHTTPError struct {
	Status int
	Body   string
}

func (e *apiHTTPError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("ai api status %d: %s", e.Status, e.Body)
}

func defaultAISettings() AISettings {
	p := AIProvider{
		ID:           defaultProvider,
		Name:         "默认中转站",
		BaseURL:      defaultAIBaseURL,
		Model:        defaultAIModel,
		SystemPrompt: defaultAISystemPrompt,
		RequestMode:  modeChat,
	}
	return AISettings{
		BaseURL:          p.BaseURL,
		Model:            p.Model,
		SystemPrompt:     p.SystemPrompt,
		Providers:        []AIProvider{p},
		ActiveProviderID: p.ID,
	}
}

func (a *App) GetAISettings() (AISettings, error) {
	settings := defaultAISettings()

	legacyBaseURL, err := a.getAppSetting("ai.base_url")
	if err != nil {
		return AISettings{}, err
	}
	legacyAPIKey, err := a.getAppSetting("ai.api_key")
	if err != nil {
		return AISettings{}, err
	}
	legacyModel, err := a.getAppSetting("ai.model")
	if err != nil {
		return AISettings{}, err
	}
	legacyPrompt, err := a.getAppSetting("ai.system_prompt")
	if err != nil {
		return AISettings{}, err
	}

	legacyProvider := AIProvider{
		ID:           defaultProvider,
		Name:         "默认中转站",
		BaseURL:      defaultString(clean(legacyBaseURL), defaultAIBaseURL),
		APIKey:       clean(legacyAPIKey),
		Model:        defaultString(clean(legacyModel), defaultAIModel),
		SystemPrompt: defaultString(clean(legacyPrompt), defaultAISystemPrompt),
		RequestMode:  modeChat,
	}

	rawProviders, err := a.getAppSetting("ai.providers")
	if err != nil {
		return AISettings{}, err
	}
	providers := []AIProvider{}
	if clean(rawProviders) != "" {
		_ = json.Unmarshal([]byte(rawProviders), &providers)
	}
	providers = normalizeProviders(providers)
	if len(providers) == 0 {
		providers = []AIProvider{legacyProvider}
	}

	activeID, err := a.getAppSetting("ai.active_provider_id")
	if err != nil {
		return AISettings{}, err
	}
	active := selectAIProvider(providers, clean(activeID))
	settings.Providers = providers
	settings.ActiveProviderID = active.ID
	settings.BaseURL = active.BaseURL
	settings.APIKey = active.APIKey
	settings.Model = active.Model
	settings.SystemPrompt = active.SystemPrompt
	return settings, nil
}

func (a *App) SaveAISettings(input AISettings) (AISettings, error) {
	providers := normalizeProviders(input.Providers)
	if len(providers) == 0 {
		providers = []AIProvider{
			{
				ID:           defaultProvider,
				Name:         "默认中转站",
				BaseURL:      defaultString(clean(input.BaseURL), defaultAIBaseURL),
				APIKey:       clean(input.APIKey),
				Model:        defaultString(clean(input.Model), defaultAIModel),
				SystemPrompt: defaultString(clean(input.SystemPrompt), defaultAISystemPrompt),
				RequestMode:  modeChat,
			},
		}
	}
	active := selectAIProvider(providers, clean(input.ActiveProviderID))
	serialized, err := json.Marshal(providers)
	if err != nil {
		return AISettings{}, err
	}

	if err := a.setAppSetting("ai.providers", string(serialized)); err != nil {
		return AISettings{}, err
	}
	if err := a.setAppSetting("ai.active_provider_id", active.ID); err != nil {
		return AISettings{}, err
	}
	// 向后兼容旧字段，保持老版本逻辑可读。
	if err := a.setAppSetting("ai.base_url", active.BaseURL); err != nil {
		return AISettings{}, err
	}
	if err := a.setAppSetting("ai.api_key", active.APIKey); err != nil {
		return AISettings{}, err
	}
	if err := a.setAppSetting("ai.model", active.Model); err != nil {
		return AISettings{}, err
	}
	if err := a.setAppSetting("ai.system_prompt", active.SystemPrompt); err != nil {
		return AISettings{}, err
	}

	return AISettings{
		BaseURL:          active.BaseURL,
		APIKey:           active.APIKey,
		Model:            active.Model,
		SystemPrompt:     active.SystemPrompt,
		Providers:        providers,
		ActiveProviderID: active.ID,
	}, nil
}

func (a *App) ParseThemeContent(input AIParseInput) (AIParseResult, error) {
	if clean(input.UserText) == "" && len(input.Files) == 0 {
		return AIParseResult{}, errors.New("user_text or files is required")
	}

	cfg, err := a.GetAISettings()
	if err != nil {
		return AIParseResult{}, err
	}
	activeProvider := selectAIProvider(cfg.Providers, clean(input.ProviderID))
	cfg.BaseURL = activeProvider.BaseURL
	cfg.APIKey = activeProvider.APIKey
	cfg.Model = activeProvider.Model
	cfg.SystemPrompt = activeProvider.SystemPrompt
	if clean(cfg.APIKey) == "" {
		return AIParseResult{}, fmt.Errorf("中转站“%s”未配置 API Key，请先到设置页完善", defaultString(clean(activeProvider.Name), "默认中转站"))
	}

	providerName := providerDisplayName(activeProvider)
	mode := normalizeRequestMode(activeProvider.RequestMode)

	if mode == modeResponses {
		a.emitAIParseEvent(map[string]any{
			"phase": "status",
			"text":  fmt.Sprintf("文件直传模式：使用 %s 的 responses 通道解析...", providerName),
		})
		raw, reqErr := requestAIJSON(
			buildEndpoint(cfg.BaseURL, "/responses"),
			cfg.APIKey,
			buildResponsesPayload(cfg, input),
		)
		if reqErr != nil {
			a.emitAIParseEvent(map[string]any{
				"phase": "error",
				"text":  fmt.Sprintf("[%s] %v", providerName, reqErr),
			})
			return AIParseResult{}, fmt.Errorf("[%s] %w", providerName, reqErr)
		}
		summary := extractResponsesText(raw)
		displayProvider := providerName + " · responses"
		a.emitAIParseEvent(map[string]any{
			"phase":    "done",
			"provider": displayProvider,
			"summary":  summary,
		})
		return AIParseResult{
			Summary:        summary,
			RawResponse:    string(raw),
			StructuredJSON: extractLikelyJSONObject(summary),
			Model:          cfg.Model,
			Provider:       displayProvider,
		}, nil
	}

	a.emitAIParseEvent(map[string]any{
		"phase": "status",
		"text":  fmt.Sprintf("兼容模式：使用 %s 的 chat.completions 解析...", providerName),
	})
	chatRaw, chatErr := requestAIJSON(
		buildEndpoint(cfg.BaseURL, "/chat/completions"),
		cfg.APIKey,
		buildChatPayload(cfg, input),
	)
	if chatErr != nil {
		a.emitAIParseEvent(map[string]any{
			"phase": "error",
			"text":  fmt.Sprintf("[%s] %v", providerName, chatErr),
		})
		return AIParseResult{}, fmt.Errorf("[%s] %w", providerName, chatErr)
	}
	summary := extractChatText(chatRaw)
	displayProvider := providerName + " · chat.completions"
	a.emitAIParseEvent(map[string]any{
		"phase":    "done",
		"provider": displayProvider,
		"summary":  summary,
	})
	return AIParseResult{
		Summary:        summary,
		RawResponse:    string(chatRaw),
		StructuredJSON: extractLikelyJSONObject(summary),
		Model:          cfg.Model,
		Provider:       displayProvider,
	}, nil
}

func normalizeProviders(items []AIProvider) []AIProvider {
	if len(items) == 0 {
		return []AIProvider{}
	}
	res := make([]AIProvider, 0, len(items))
	seen := map[string]struct{}{}
	for i, item := range items {
		id := clean(item.ID)
		if id == "" {
			id = fmt.Sprintf("provider-%d", i+1)
		}
		if _, ok := seen[id]; ok {
			id = fmt.Sprintf("%s-%d", id, i+1)
		}
		seen[id] = struct{}{}

		name := clean(item.Name)
		if name == "" {
			name = fmt.Sprintf("中转站 %d", i+1)
		}
		baseURL := defaultString(clean(item.BaseURL), defaultAIBaseURL)
		model := defaultString(clean(item.Model), defaultAIModel)
		prompt := defaultString(clean(item.SystemPrompt), defaultAISystemPrompt)
		res = append(res, AIProvider{
			ID:           id,
			Name:         name,
			BaseURL:      baseURL,
			APIKey:       clean(item.APIKey),
			Model:        model,
			SystemPrompt: prompt,
			RequestMode:  normalizeRequestMode(item.RequestMode),
		})
	}
	return res
}

func selectAIProvider(providers []AIProvider, providerID string) AIProvider {
	if len(providers) == 0 {
		return AIProvider{
			ID:           defaultProvider,
			Name:         "默认中转站",
			BaseURL:      defaultAIBaseURL,
			Model:        defaultAIModel,
			SystemPrompt: defaultAISystemPrompt,
			RequestMode:  modeChat,
		}
	}
	if clean(providerID) != "" {
		for _, p := range providers {
			if clean(p.ID) == clean(providerID) {
				return p
			}
		}
	}
	return providers[0]
}

func normalizeRequestMode(v string) string {
	switch strings.ToLower(clean(v)) {
	case modeResponses:
		return modeResponses
	default:
		return modeChat
	}
}

func providerDisplayName(p AIProvider) string {
	if clean(p.Name) != "" {
		return clean(p.Name)
	}
	if u, err := url.Parse(clean(p.BaseURL)); err == nil && clean(u.Host) != "" {
		return clean(u.Host)
	}
	return "当前中转站"
}

func (a *App) emitAIParseEvent(payload map[string]any) {
	if a == nil || a.ctx == nil {
		return
	}
	runtime.EventsEmit(a.ctx, "ai:parse_stream", payload)
}

func buildResponsesPayload(cfg AISettings, input AIParseInput) map[string]any {
	userContent := []map[string]any{
		{
			"type": "input_text",
			"text": buildAIUserInstruction(input.UserText),
		},
	}

	for _, file := range input.Files {
		if clean(file.Base64Data) == "" {
			continue
		}
		mimeType := normalizeMimeType(file.FileName, file.MimeType)
		dataURL := fmt.Sprintf("data:%s;base64,%s", mimeType, file.Base64Data)
		if strings.HasPrefix(mimeType, "image/") {
			userContent = append(userContent, map[string]any{
				"type":      "input_image",
				"image_url": dataURL,
			})
			continue
		}
		userContent = append(userContent, map[string]any{
			"type":      "input_file",
			"filename":  safeFilename(file.FileName),
			"file_data": dataURL,
		})
	}

	payload := map[string]any{
		"model": cfg.Model,
		"input": []map[string]any{
			{
				"role": "system",
				"content": []map[string]any{
					{
						"type": "input_text",
						"text": cfg.SystemPrompt,
					},
				},
			},
			{
				"role":    "user",
				"content": userContent,
			},
		},
		"temperature": clampTemperature(input.Temperature),
	}
	if input.MaxOutputTokens > 0 {
		payload["max_output_tokens"] = input.MaxOutputTokens
	}
	return payload
}

func buildChatPayload(cfg AISettings, input AIParseInput) map[string]any {
	userContent := []map[string]any{
		{
			"type": "text",
			"text": buildAIUserInstruction(input.UserText),
		},
	}
	for _, file := range input.Files {
		if clean(file.Base64Data) == "" {
			continue
		}
		mimeType := normalizeMimeType(file.FileName, file.MimeType)
		if strings.HasPrefix(mimeType, "image/") {
			userContent = append(userContent, map[string]any{
				"type": "image_url",
				"image_url": map[string]any{
					"url": fmt.Sprintf("data:%s;base64,%s", mimeType, file.Base64Data),
				},
			})
			continue
		}
		textPayload := decodeTextFile(file.Base64Data, 12000)
		if textPayload == "" {
			userContent = append(userContent, map[string]any{
				"type": "text",
				"text": fmt.Sprintf("附件 %s (%s) 已上传；当前接口不支持直接解析该文件类型，请结合其内容进行概括。", safeFilename(file.FileName), mimeType),
			})
			continue
		}
		userContent = append(userContent, map[string]any{
			"type": "text",
			"text": fmt.Sprintf("附件 %s 内容片段：\n%s", safeFilename(file.FileName), textPayload),
		})
	}

	payload := map[string]any{
		"model": cfg.Model,
		"messages": []map[string]any{
			{
				"role":    "system",
				"content": cfg.SystemPrompt,
			},
			{
				"role":    "user",
				"content": userContent,
			},
		},
		"temperature": clampTemperature(input.Temperature),
	}
	if input.MaxOutputTokens > 0 {
		payload["max_tokens"] = input.MaxOutputTokens
	}
	return payload
}

func buildAIUserInstruction(userText string) string {
	text := clean(userText)
	if text == "" {
		text = "请基于附件完成题材解析。"
	}
	return strings.Join([]string{
		"请基于以下资料完成A股题材解析，并尽量给出可直接落库的信息。",
		"用户补充说明：",
		text,
		"请严格按以下顺序输出：",
		"1. 核心结论",
		"2. 题材与公司映射",
		"3. 投资逻辑与验证指标",
		"4. 风险与反证",
		"5. 结构化JSON",
	}, "\n")
}

func requestAIJSON(url string, apiKey string, payload map[string]any) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 150 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 300 {
		return nil, &apiHTTPError{
			Status: resp.StatusCode,
			Body:   compactErrorBody(raw),
		}
	}
	return raw, nil
}

func requestAIJSONStream(url string, apiKey string, payload map[string]any, onDelta func(delta string)) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 180 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		raw, readErr := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
		if readErr != nil {
			return nil, readErr
		}
		return nil, &apiHTTPError{
			Status: resp.StatusCode,
			Body:   compactErrorBody(raw),
		}
	}

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	if !strings.Contains(contentType, "text/event-stream") {
		return io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 128*1024), 2*1024*1024)

	rawEvents := make([]string, 0, 128)
	dataLines := make([]string, 0, 8)
	flushData := func() {
		if len(dataLines) == 0 {
			return
		}
		data := strings.Join(dataLines, "\n")
		dataLines = dataLines[:0]
		if data == "[DONE]" {
			return
		}
		rawEvents = append(rawEvents, data)

		var obj map[string]any
		if err := json.Unmarshal([]byte(data), &obj); err != nil {
			return
		}
		delta := extractStreamDeltaText(obj)
		if clean(delta) != "" && onDelta != nil {
			onDelta(delta)
		}
	}

	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			flushData()
			continue
		}
		if strings.HasPrefix(line, "data:") {
			dataLines = append(dataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	flushData()
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	streamRaw := strings.Join(rawEvents, "\n")
	if streamRaw == "" {
		streamRaw = `{"stream":"ok","events":0}`
	}
	return []byte(streamRaw), nil
}

func extractStreamDeltaText(obj map[string]any) string {
	typ, _ := obj["type"].(string)
	typ = strings.ToLower(strings.TrimSpace(typ))

	if strings.Contains(typ, "delta") {
		if v, ok := obj["delta"].(string); ok {
			return v
		}
		if dObj, ok := obj["delta"].(map[string]any); ok {
			if v, ok := dObj["text"].(string); ok {
				return v
			}
		}
		if v, ok := obj["text"].(string); ok {
			return v
		}
	}

	if choices, ok := obj["choices"].([]any); ok && len(choices) > 0 {
		choiceObj, _ := choices[0].(map[string]any)
		if choiceObj != nil {
			if deltaObj, ok := choiceObj["delta"].(map[string]any); ok {
				if v, ok := deltaObj["content"].(string); ok {
					return v
				}
				if arr, ok := deltaObj["content"].([]any); ok {
					parts := make([]string, 0, len(arr))
					for _, item := range arr {
						itemObj, _ := item.(map[string]any)
						if itemObj == nil {
							continue
						}
						if v, ok := itemObj["text"].(string); ok && clean(v) != "" {
							parts = append(parts, v)
						}
					}
					return strings.Join(parts, "")
				}
			}
		}
	}
	return ""
}

func extractResponsesText(raw []byte) string {
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return string(raw)
	}

	if text, ok := obj["output_text"].(string); ok && clean(text) != "" {
		return text
	}

	output, ok := obj["output"].([]any)
	if !ok {
		return string(raw)
	}
	var parts []string
	for _, item := range output {
		itemObj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		content, ok := itemObj["content"].([]any)
		if !ok {
			continue
		}
		for _, c := range content {
			cObj, ok := c.(map[string]any)
			if !ok {
				continue
			}
			if t, _ := cObj["type"].(string); t == "output_text" {
				if v, _ := cObj["text"].(string); clean(v) != "" {
					parts = append(parts, v)
				}
			}
		}
	}
	if len(parts) == 0 {
		return string(raw)
	}
	return strings.Join(parts, "\n")
}

func extractChatText(raw []byte) string {
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return string(raw)
	}

	choices, ok := obj["choices"].([]any)
	if !ok || len(choices) == 0 {
		return string(raw)
	}
	choiceObj, ok := choices[0].(map[string]any)
	if !ok {
		return string(raw)
	}
	messageObj, ok := choiceObj["message"].(map[string]any)
	if !ok {
		return string(raw)
	}

	if v, ok := messageObj["content"].(string); ok {
		return v
	}
	contentItems, ok := messageObj["content"].([]any)
	if !ok {
		return string(raw)
	}
	parts := make([]string, 0, len(contentItems))
	for _, item := range contentItems {
		itemObj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if v, _ := itemObj["text"].(string); clean(v) != "" {
			parts = append(parts, v)
		}
	}
	if len(parts) == 0 {
		return string(raw)
	}
	return strings.Join(parts, "\n")
}

func compactErrorBody(raw []byte) string {
	text := strings.TrimSpace(string(raw))
	if text == "" {
		return "empty response"
	}
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err == nil {
		if errObj, ok := obj["error"].(map[string]any); ok {
			if code, _ := errObj["code"].(string); strings.EqualFold(clean(code), "refresh_token_reused") {
				return "上游网关凭证已失效（refresh_token_reused），请在网关后台重新登录/生成新令牌，或更换可用 API Key。"
			}
			if msg, _ := errObj["message"].(string); clean(msg) != "" {
				if strings.Contains(strings.ToLower(msg), "refresh token has already been used") {
					return "上游网关凭证已失效（refresh_token_reused），请在网关后台重新登录/生成新令牌，或更换可用 API Key。"
				}
				return msg
			}
		}
	}
	if len(text) > 320 {
		return text[:320] + "..."
	}
	return text
}

func normalizeMimeType(fileName string, mimeType string) string {
	mt := clean(mimeType)
	if mt == "" {
		mt = mime.TypeByExtension(strings.ToLower(filepath.Ext(fileName)))
	}
	if idx := strings.Index(mt, ";"); idx > 0 {
		mt = mt[:idx]
	}
	if mt == "" {
		mt = "application/octet-stream"
	}
	return mt
}

func safeFilename(fileName string) string {
	name := clean(fileName)
	if name == "" {
		return "attachment"
	}
	return name
}

func clampTemperature(v float64) float64 {
	if v <= 0 {
		return 0.2
	}
	if v > 2 {
		return 2
	}
	return v
}

func decodeTextFile(base64Data string, maxChars int) string {
	b, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return ""
	}
	text := clean(string(b))
	if text == "" {
		return ""
	}
	if len(text) > maxChars {
		return text[:maxChars] + "\n...(truncated)"
	}
	return text
}

func buildEndpoint(baseURL string, path string) string {
	return strings.TrimRight(baseURL, "/") + path
}

func extractLikelyJSONObject(text string) string {
	raw := strings.TrimSpace(text)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "```") {
		raw = strings.ReplaceAll(raw, "```json", "")
		raw = strings.ReplaceAll(raw, "```JSON", "")
		raw = strings.ReplaceAll(raw, "```", "")
		raw = strings.TrimSpace(raw)
		if json.Valid([]byte(raw)) {
			return raw
		}
	}
	if json.Valid([]byte(raw)) {
		return raw
	}

	start := -1
	depth := 0
	inString := false
	escaped := false
	for i, r := range raw {
		if escaped {
			escaped = false
			continue
		}
		if r == '\\' && inString {
			escaped = true
			continue
		}
		if r == '"' {
			inString = !inString
			continue
		}
		if inString {
			continue
		}
		if r == '{' {
			if depth == 0 {
				start = i
			}
			depth++
		}
		if r == '}' {
			if depth > 0 {
				depth--
				if depth == 0 && start >= 0 {
					candidate := strings.TrimSpace(raw[start : i+1])
					if json.Valid([]byte(candidate)) {
						return candidate
					}
					start = -1
				}
			}
		}
	}
	return ""
}

func (a *App) getAppSetting(key string) (string, error) {
	var value string
	err := a.db.QueryRow(`SELECT value FROM app_settings WHERE key = ?`, key).Scan(&value)
	if err == nil {
		return value, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return "", err
}

func (a *App) setAppSetting(key string, value string) error {
	_, err := a.db.Exec(`
INSERT INTO app_settings (key, value, updated_at)
VALUES (?, ?, datetime('now'))
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = datetime('now')
`, key, value)
	return err
}
