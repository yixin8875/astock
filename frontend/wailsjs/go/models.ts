export namespace main {
	
	export class AIFileInput {
	    file_name: string;
	    mime_type: string;
	    base64_data: string;
	
	    static createFrom(source: any = {}) {
	        return new AIFileInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.file_name = source["file_name"];
	        this.mime_type = source["mime_type"];
	        this.base64_data = source["base64_data"];
	    }
	}
	export class AIImportInput {
	    json_payload: string;
	    files: AIFileInput[];
	    save_attachments: boolean;
	    attachment_note: string;
	
	    static createFrom(source: any = {}) {
	        return new AIImportInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.json_payload = source["json_payload"];
	        this.files = this.convertValues(source["files"], AIFileInput);
	        this.save_attachments = source["save_attachments"];
	        this.attachment_note = source["attachment_note"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIImportResult {
	    created_companies: number;
	    created_themes: number;
	    upserted_mappings: number;
	    created_theses: number;
	    saved_attachments: number;
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new AIImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.created_companies = source["created_companies"];
	        this.created_themes = source["created_themes"];
	        this.upserted_mappings = source["upserted_mappings"];
	        this.created_theses = source["created_theses"];
	        this.saved_attachments = source["saved_attachments"];
	        this.warnings = source["warnings"];
	    }
	}
	export class AIImportValidation {
	    is_valid: boolean;
	    errors: string[];
	    warnings: string[];
	    normalized_json: string;
	    estimated_writes: number;
	
	    static createFrom(source: any = {}) {
	        return new AIImportValidation(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.is_valid = source["is_valid"];
	        this.errors = source["errors"];
	        this.warnings = source["warnings"];
	        this.normalized_json = source["normalized_json"];
	        this.estimated_writes = source["estimated_writes"];
	    }
	}
	export class AIImportValidationInput {
	    json_payload: string;
	
	    static createFrom(source: any = {}) {
	        return new AIImportValidationInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.json_payload = source["json_payload"];
	    }
	}
	export class AIParseInput {
	    user_text: string;
	    files: AIFileInput[];
	    temperature: number;
	    max_output_tokens: number;
	    provider_id: string;
	
	    static createFrom(source: any = {}) {
	        return new AIParseInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.user_text = source["user_text"];
	        this.files = this.convertValues(source["files"], AIFileInput);
	        this.temperature = source["temperature"];
	        this.max_output_tokens = source["max_output_tokens"];
	        this.provider_id = source["provider_id"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIParseResult {
	    summary: string;
	    raw_response: string;
	    structured_json: string;
	    model: string;
	    provider: string;
	
	    static createFrom(source: any = {}) {
	        return new AIParseResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.summary = source["summary"];
	        this.raw_response = source["raw_response"];
	        this.structured_json = source["structured_json"];
	        this.model = source["model"];
	        this.provider = source["provider"];
	    }
	}
	export class AIProvider {
	    id: string;
	    name: string;
	    base_url: string;
	    api_key: string;
	    model: string;
	    system_prompt: string;
	    request_mode: string;
	
	    static createFrom(source: any = {}) {
	        return new AIProvider(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.base_url = source["base_url"];
	        this.api_key = source["api_key"];
	        this.model = source["model"];
	        this.system_prompt = source["system_prompt"];
	        this.request_mode = source["request_mode"];
	    }
	}
	export class AISettings {
	    base_url: string;
	    api_key: string;
	    model: string;
	    system_prompt: string;
	    providers: AIProvider[];
	    active_provider_id: string;
	
	    static createFrom(source: any = {}) {
	        return new AISettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.base_url = source["base_url"];
	        this.api_key = source["api_key"];
	        this.model = source["model"];
	        this.system_prompt = source["system_prompt"];
	        this.providers = this.convertValues(source["providers"], AIProvider);
	        this.active_provider_id = source["active_provider_id"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Attachment {
	    id: number;
	    scope_type: string;
	    scope_id: number;
	    file_name: string;
	    mime_type: string;
	    file_size: number;
	    note: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Attachment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.scope_type = source["scope_type"];
	        this.scope_id = source["scope_id"];
	        this.file_name = source["file_name"];
	        this.mime_type = source["mime_type"];
	        this.file_size = source["file_size"];
	        this.note = source["note"];
	        this.created_at = source["created_at"];
	    }
	}
	export class AttachmentInput {
	    scope_type: string;
	    scope_id: number;
	    note: string;
	    files: AIFileInput[];
	
	    static createFrom(source: any = {}) {
	        return new AttachmentInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scope_type = source["scope_type"];
	        this.scope_id = source["scope_id"];
	        this.note = source["note"];
	        this.files = this.convertValues(source["files"], AIFileInput);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AttachmentListInput {
	    scope_type: string;
	    scope_id: number;
	    query: string;
	
	    static createFrom(source: any = {}) {
	        return new AttachmentListInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scope_type = source["scope_type"];
	        this.scope_id = source["scope_id"];
	        this.query = source["query"];
	    }
	}
	export class AttachmentPreview {
	    id: number;
	    file_name: string;
	    mime_type: string;
	    data_url: string;
	    text_preview: string;
	
	    static createFrom(source: any = {}) {
	        return new AttachmentPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.file_name = source["file_name"];
	        this.mime_type = source["mime_type"];
	        this.data_url = source["data_url"];
	        this.text_preview = source["text_preview"];
	    }
	}
	export class Company {
	    id: number;
	    ts_code: string;
	    company_name: string;
	    industry_l1: string;
	    industry_l2: string;
	    listing_board: string;
	    status: string;
	    created_at: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Company(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.ts_code = source["ts_code"];
	        this.company_name = source["company_name"];
	        this.industry_l1 = source["industry_l1"];
	        this.industry_l2 = source["industry_l2"];
	        this.listing_board = source["listing_board"];
	        this.status = source["status"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class CompanyInput {
	    ts_code: string;
	    company_name: string;
	    industry_l1: string;
	    industry_l2: string;
	    listing_board: string;
	
	    static createFrom(source: any = {}) {
	        return new CompanyInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ts_code = source["ts_code"];
	        this.company_name = source["company_name"];
	        this.industry_l1 = source["industry_l1"];
	        this.industry_l2 = source["industry_l2"];
	        this.listing_board = source["listing_board"];
	    }
	}
	export class CompanyThemeInput {
	    company_id: number;
	    theme_id: number;
	    relevance_score: number;
	    role_in_chain: string;
	    is_primary: boolean;
	    evidence_summary: string;
	
	    static createFrom(source: any = {}) {
	        return new CompanyThemeInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.company_id = source["company_id"];
	        this.theme_id = source["theme_id"];
	        this.relevance_score = source["relevance_score"];
	        this.role_in_chain = source["role_in_chain"];
	        this.is_primary = source["is_primary"];
	        this.evidence_summary = source["evidence_summary"];
	    }
	}
	export class CompanyThemeView {
	    id: number;
	    company_id: number;
	    theme_id: number;
	    ts_code: string;
	    company_name: string;
	    theme_name: string;
	    relevance_score: number;
	    role_in_chain: string;
	    is_primary: boolean;
	    evidence_summary: string;
	    latest_thesis_title: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new CompanyThemeView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.company_id = source["company_id"];
	        this.theme_id = source["theme_id"];
	        this.ts_code = source["ts_code"];
	        this.company_name = source["company_name"];
	        this.theme_name = source["theme_name"];
	        this.relevance_score = source["relevance_score"];
	        this.role_in_chain = source["role_in_chain"];
	        this.is_primary = source["is_primary"];
	        this.evidence_summary = source["evidence_summary"];
	        this.latest_thesis_title = source["latest_thesis_title"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class CompanyUpdateInput {
	    id: number;
	    ts_code: string;
	    company_name: string;
	    industry_l1: string;
	    industry_l2: string;
	    listing_board: string;
	
	    static createFrom(source: any = {}) {
	        return new CompanyUpdateInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.ts_code = source["ts_code"];
	        this.company_name = source["company_name"];
	        this.industry_l1 = source["industry_l1"];
	        this.industry_l2 = source["industry_l2"];
	        this.listing_board = source["listing_board"];
	    }
	}
	export class DashboardStats {
	    company_count: number;
	    theme_count: number;
	    company_theme_rows: number;
	    active_thesis_rows: number;
	
	    static createFrom(source: any = {}) {
	        return new DashboardStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.company_count = source["company_count"];
	        this.theme_count = source["theme_count"];
	        this.company_theme_rows = source["company_theme_rows"];
	        this.active_thesis_rows = source["active_thesis_rows"];
	    }
	}
	export class GlobalSearchItem {
	    type: string;
	    id: number;
	    title: string;
	    subtitle: string;
	    target_view: string;
	    company_theme_id: number;
	    thesis_id: number;
	
	    static createFrom(source: any = {}) {
	        return new GlobalSearchItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.id = source["id"];
	        this.title = source["title"];
	        this.subtitle = source["subtitle"];
	        this.target_view = source["target_view"];
	        this.company_theme_id = source["company_theme_id"];
	        this.thesis_id = source["thesis_id"];
	    }
	}
	export class Theme {
	    id: number;
	    theme_name: string;
	    theme_type: string;
	    description: string;
	    lifecycle_stage: string;
	    heat_score: number;
	    is_pinned_main: boolean;
	    created_at: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Theme(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.theme_name = source["theme_name"];
	        this.theme_type = source["theme_type"];
	        this.description = source["description"];
	        this.lifecycle_stage = source["lifecycle_stage"];
	        this.heat_score = source["heat_score"];
	        this.is_pinned_main = source["is_pinned_main"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class ThemeChangeLog {
	    id: number;
	    theme_id: number;
	    old_heat_score: number;
	    new_heat_score: number;
	    old_lifecycle_stage: string;
	    new_lifecycle_stage: string;
	    old_is_pinned_main: boolean;
	    new_is_pinned_main: boolean;
	    change_note: string;
	    operator: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new ThemeChangeLog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.theme_id = source["theme_id"];
	        this.old_heat_score = source["old_heat_score"];
	        this.new_heat_score = source["new_heat_score"];
	        this.old_lifecycle_stage = source["old_lifecycle_stage"];
	        this.new_lifecycle_stage = source["new_lifecycle_stage"];
	        this.old_is_pinned_main = source["old_is_pinned_main"];
	        this.new_is_pinned_main = source["new_is_pinned_main"];
	        this.change_note = source["change_note"];
	        this.operator = source["operator"];
	        this.created_at = source["created_at"];
	    }
	}
	export class ThemeInput {
	    theme_name: string;
	    theme_type: string;
	    description: string;
	    lifecycle_stage: string;
	    heat_score: number;
	
	    static createFrom(source: any = {}) {
	        return new ThemeInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme_name = source["theme_name"];
	        this.theme_type = source["theme_type"];
	        this.description = source["description"];
	        this.lifecycle_stage = source["lifecycle_stage"];
	        this.heat_score = source["heat_score"];
	    }
	}
	export class ThemeMetaUpdateInput {
	    theme_id: number;
	    heat_score: number;
	    lifecycle_stage: string;
	    is_pinned_main: boolean;
	    change_note: string;
	    operator: string;
	
	    static createFrom(source: any = {}) {
	        return new ThemeMetaUpdateInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme_id = source["theme_id"];
	        this.heat_score = source["heat_score"];
	        this.lifecycle_stage = source["lifecycle_stage"];
	        this.is_pinned_main = source["is_pinned_main"];
	        this.change_note = source["change_note"];
	        this.operator = source["operator"];
	    }
	}
	export class Thesis {
	    id: number;
	    company_theme_id: number;
	    thesis_version: number;
	    thesis_title: string;
	    thesis_body: string;
	    key_metrics: string;
	    expected_timeline: string;
	    confidence_level: string;
	    status: string;
	    author: string;
	    created_at: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Thesis(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.company_theme_id = source["company_theme_id"];
	        this.thesis_version = source["thesis_version"];
	        this.thesis_title = source["thesis_title"];
	        this.thesis_body = source["thesis_body"];
	        this.key_metrics = source["key_metrics"];
	        this.expected_timeline = source["expected_timeline"];
	        this.confidence_level = source["confidence_level"];
	        this.status = source["status"];
	        this.author = source["author"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class ThesisInput {
	    company_theme_id: number;
	    thesis_title: string;
	    thesis_body: string;
	    key_metrics: string;
	    expected_timeline: string;
	    confidence_level: string;
	    author: string;
	
	    static createFrom(source: any = {}) {
	        return new ThesisInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.company_theme_id = source["company_theme_id"];
	        this.thesis_title = source["thesis_title"];
	        this.thesis_body = source["thesis_body"];
	        this.key_metrics = source["key_metrics"];
	        this.expected_timeline = source["expected_timeline"];
	        this.confidence_level = source["confidence_level"];
	        this.author = source["author"];
	    }
	}
	export class ThesisReview {
	    id: number;
	    thesis_id: number;
	    review_date: string;
	    review_result: string;
	    pnl_hint: string;
	    review_note: string;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new ThesisReview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.thesis_id = source["thesis_id"];
	        this.review_date = source["review_date"];
	        this.review_result = source["review_result"];
	        this.pnl_hint = source["pnl_hint"];
	        this.review_note = source["review_note"];
	        this.created_at = source["created_at"];
	    }
	}
	export class ThesisReviewInput {
	    thesis_id: number;
	    review_date: string;
	    review_result: string;
	    pnl_hint: string;
	    review_note: string;
	
	    static createFrom(source: any = {}) {
	        return new ThesisReviewInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.thesis_id = source["thesis_id"];
	        this.review_date = source["review_date"];
	        this.review_result = source["review_result"];
	        this.pnl_hint = source["pnl_hint"];
	        this.review_note = source["review_note"];
	    }
	}

}

