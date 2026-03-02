import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Building2,
  CheckCircle2,
  FileSearch,
  FileText,
  FunnelX,
  LayoutGrid,
  Link2,
  Palette,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Upload,
  X,
  Tags,
} from "lucide-react";
import {
  CreateCompany,
  CreateTheme,
  CreateThesis,
  CreateThesisReview,
  DashboardStats as fetchStats,
  DBPath,
  GetAISettings,
  GlobalSearch,
  LinkCompanyTheme,
  ListCompanies,
  ListCompanyThemes,
  ListThemeChangeLogs,
  ListThemes,
  ListTheses,
  ListThesisReviews,
  GetAttachmentPreview,
  ImportAIParseResult,
  ListAttachments,
  ParseThemeContent,
  SaveAISettings,
  UpdateCompany,
  UpdateThemeMeta,
  ValidateAIImport,
} from "../wailsjs/go/main/App";
import { EventsOn } from "../wailsjs/runtime/runtime";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Skeleton } from "./components/ui/skeleton";
import { Switch } from "./components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Textarea } from "./components/ui/textarea";

type ViewKey = "overview" | "companies" | "themes" | "mapping" | "thesis" | "ai" | "attachments" | "settings";
type ThemePreset = "blue" | "emerald" | "indigo" | "slate";

type Company = {
  id: number;
  ts_code: string;
  company_name: string;
  industry_l1: string;
  industry_l2: string;
  listing_board: string;
};

type Theme = {
  id: number;
  theme_name: string;
  theme_type: string;
  description: string;
  lifecycle_stage: string;
  heat_score: number;
  is_pinned_main: boolean;
};

type ThemeChangeLog = {
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
};

type CompanyTheme = {
  id: number;
  company_id: number;
  theme_id: number;
  ts_code: string;
  company_name: string;
  theme_name: string;
  relevance_score: number;
  is_primary: boolean;
  latest_thesis_title: string;
};

type Thesis = {
  id: number;
  company_theme_id: number;
  thesis_version: number;
  thesis_title: string;
  thesis_body: string;
  confidence_level: string;
  expected_timeline: string;
  key_metrics: string;
  created_at: string;
};

type ThesisReview = {
  id: number;
  thesis_id: number;
  review_date: string;
  review_result: string;
  pnl_hint: string;
  review_note: string;
  created_at: string;
};

type Stats = {
  company_count: number;
  theme_count: number;
  company_theme_rows: number;
  active_thesis_rows: number;
};

type GlobalSearchItem = {
  type: string;
  id: number;
  title: string;
  subtitle: string;
  target_view: string;
  company_theme_id: number;
  thesis_id: number;
};

type AISettings = {
  base_url: string;
  api_key: string;
  model: string;
  system_prompt: string;
  providers: AIProvider[];
  active_provider_id: string;
};

type AIProvider = {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  system_prompt: string;
  request_mode: "chat" | "responses" | string;
};

type AIFileInput = {
  file_name: string;
  mime_type: string;
  base64_data: string;
  size: number;
};

type AIParseResult = {
  summary: string;
  raw_response: string;
  structured_json: string;
  model: string;
  provider: string;
};

type AIImportValidation = {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  normalized_json: string;
  estimated_writes: number;
};

type AIImportResult = {
  created_companies: number;
  created_themes: number;
  upserted_mappings: number;
  created_theses: number;
  saved_attachments: number;
  warnings: string[];
};

type Attachment = {
  id: number;
  scope_type: string;
  scope_id: number;
  file_name: string;
  mime_type: string;
  file_size: number;
  note: string;
  created_at: string;
};

type AttachmentPreview = {
  id: number;
  file_name: string;
  mime_type: string;
  data_url: string;
  text_preview: string;
};

type AIStreamEvent = {
  phase?: string;
  delta?: string;
  text?: string;
  summary?: string;
  provider?: string;
};

const AI_STREAM_EVENT = "ai:parse_stream";

function App() {
  const aiFileInputRef = useRef<HTMLInputElement | null>(null);

  const [view, setView] = useState<ViewKey>("overview");
  const [themePreset, setThemePreset] = useState<ThemePreset>(() => {
    if (typeof window === "undefined") {
      return "blue";
    }
    const v = window.localStorage.getItem("astock.theme.preset");
    if (v === "emerald" || v === "indigo" || v === "slate" || v === "blue") {
      return v;
    }
    return "blue";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("astock.sidebar.collapsed") === "1";
  });

  const [dbPath, setDbPath] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [themeLogs, setThemeLogs] = useState<ThemeChangeLog[]>([]);
  const [companyThemes, setCompanyThemes] = useState<CompanyTheme[]>([]);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [thesisReviews, setThesisReviews] = useState<ThesisReview[]>([]);

  const [selectedThemeID, setSelectedThemeID] = useState<number>(0);
  const [selectedCompanyThemeID, setSelectedCompanyThemeID] = useState<number>(0);
  const [selectedThesisID, setSelectedThesisID] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [noticeView, setNoticeView] = useState<ViewKey>("overview");

  const [relationQuery, setRelationQuery] = useState("");
  const [primaryOnlyFilter, setPrimaryOnlyFilter] = useState(false);

  const [globalQuery, setGlobalQuery] = useState("");
  const [globalResults, setGlobalResults] = useState<GlobalSearchItem[]>([]);
  const [globalOpen, setGlobalOpen] = useState(false);

  const [aiSettings, setAISettings] = useState<AISettings>({
    base_url: "https://api.openai.com/v1",
    api_key: "",
    model: "gpt-4.1",
    system_prompt: "",
    providers: [
      {
        id: "default",
        name: "默认中转站",
        base_url: "https://api.openai.com/v1",
        api_key: "",
        model: "gpt-4.1",
        system_prompt: "",
        request_mode: "chat",
      },
    ],
    active_provider_id: "default",
  });
  const [aiRuntimeProviderID, setAIRuntimeProviderID] = useState("default");
  const [aiText, setAIText] = useState("");
  const [aiFiles, setAIFiles] = useState<AIFileInput[]>([]);
  const [aiResult, setAIResult] = useState<AIParseResult | null>(null);
  const [aiStreamingText, setAIStreamingText] = useState("");
  const [aiStreamingProvider, setAIStreamingProvider] = useState("");
  const [aiStructuredJSON, setAIStructuredJSON] = useState("");
  const [aiValidation, setAIValidation] = useState<AIImportValidation | null>(null);
  const [aiImportResult, setAIImportResult] = useState<AIImportResult | null>(null);
  const [aiAttachmentNote, setAIAttachmentNote] = useState("AI解析附件");
  const [aiBusy, setAIBusy] = useState(false);
  const [aiValidating, setAIValidating] = useState(false);
  const [aiImporting, setAIImporting] = useState(false);
  const [aiSaving, setAISaving] = useState(false);
  const [aiTemperature, setAITemperature] = useState(() => {
    if (typeof window === "undefined") {
      return 0.2;
    }
    const v = Number(window.localStorage.getItem("astock.ai.temperature"));
    if (Number.isNaN(v) || v <= 0) {
      return 0.2;
    }
    return v;
  });
  const [aiMaxTokens, setAIMaxTokens] = useState(() => {
    if (typeof window === "undefined") {
      return 1800;
    }
    const v = Number(window.localStorage.getItem("astock.ai.max_tokens"));
    if (Number.isNaN(v) || v <= 0) {
      return 1800;
    }
    return Math.floor(v);
  });
  const [companiesPanel, setCompaniesPanel] = useState<"list" | "create" | "edit">("list");
  const [themesPanel, setThemesPanel] = useState<"manage" | "create">("manage");
  const [mappingPanel, setMappingPanel] = useState<"list" | "create">("list");
  const [thesisPanel, setThesisPanel] = useState<"list" | "create">("list");
  const [attachmentQuery, setAttachmentQuery] = useState("");
  const [attachmentScope, setAttachmentScope] = useState("all");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false);

  const [companyForm, setCompanyForm] = useState({
    ts_code: "",
    company_name: "",
    industry_l1: "",
    industry_l2: "",
    listing_board: "主板",
  });
  const [companyEditForm, setCompanyEditForm] = useState({
    id: 0,
    ts_code: "",
    company_name: "",
    industry_l1: "",
    industry_l2: "",
    listing_board: "主板",
  });
  const [themeForm, setThemeForm] = useState({
    theme_name: "",
    theme_type: "concept",
    description: "",
    lifecycle_stage: "growth",
    heat_score: 60,
  });
  const [themeMetaForm, setThemeMetaForm] = useState({
    theme_id: 0,
    heat_score: 60,
    lifecycle_stage: "growth",
    is_pinned_main: false,
    change_note: "",
    operator: "desktop-user",
  });
  const [linkForm, setLinkForm] = useState({
    company_id: 0,
    theme_id: 0,
    relevance_score: 70,
    role_in_chain: "核心标的",
    is_primary: true,
    evidence_summary: "",
  });
  const [thesisForm, setThesisForm] = useState({
    company_theme_id: 0,
    thesis_title: "",
    thesis_body: "",
    key_metrics: "",
    expected_timeline: "6-18个月",
    confidence_level: "medium",
    author: "desktop-user",
  });
  const [reviewForm, setReviewForm] = useState({
    thesis_id: 0,
    review_date: todayISO(),
    review_result: "validated",
    pnl_hint: "",
    review_note: "",
  });

  const selectedRelation = useMemo(
    () => companyThemes.find((item) => item.id === selectedCompanyThemeID) ?? null,
    [companyThemes, selectedCompanyThemeID],
  );

  const selectedTheme = useMemo(() => themes.find((item) => item.id === selectedThemeID) ?? null, [themes, selectedThemeID]);

  const aiProviders = useMemo<AIProvider[]>(() => {
    const rows = Array.isArray(aiSettings.providers) ? aiSettings.providers : [];
    if (rows.length > 0) {
      return rows;
    }
    return [
      {
        id: "default",
        name: "默认中转站",
        base_url: aiSettings.base_url || "https://api.openai.com/v1",
        api_key: aiSettings.api_key || "",
        model: aiSettings.model || "gpt-4.1",
        system_prompt: aiSettings.system_prompt || "",
        request_mode: "chat",
      },
    ];
  }, [aiSettings]);

  const activeAIProvider = useMemo<AIProvider>(() => {
    return aiProviders.find((item) => item.id === aiSettings.active_provider_id) || aiProviders[0];
  }, [aiProviders, aiSettings.active_provider_id]);

  const runtimeAIProvider = useMemo<AIProvider>(() => {
    return aiProviders.find((item) => item.id === aiRuntimeProviderID) || activeAIProvider;
  }, [aiProviders, aiRuntimeProviderID, activeAIProvider]);

  const filteredCompanyThemes = useMemo(() => {
    const query = relationQuery.trim().toLowerCase();
    return companyThemes.filter((item) => {
      if (primaryOnlyFilter && !item.is_primary) {
        return false;
      }
      if (!query) {
        return true;
      }
      const text = `${item.company_name} ${item.ts_code} ${item.theme_name}`.toLowerCase();
      return text.includes(query);
    });
  }, [companyThemes, relationQuery, primaryOnlyFilter]);

  const companyThemeOptions = useMemo(
    () =>
      companyThemes.map((item) => ({
        value: String(item.id),
        label: `${item.company_name} / ${item.theme_name}`,
      })),
    [companyThemes],
  );

  useEffect(() => {
    window.localStorage.setItem("astock.sidebar.collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem("astock.theme.preset", themePreset);
  }, [themePreset]);

  useEffect(() => {
    window.localStorage.setItem("astock.ai.temperature", String(aiTemperature));
  }, [aiTemperature]);

  useEffect(() => {
    window.localStorage.setItem("astock.ai.max_tokens", String(aiMaxTokens));
  }, [aiMaxTokens]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    setNoticeView(view);
    if (notice.type === "err") {
      return;
    }
    const timer = window.setTimeout(() => {
      setNotice(null);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    void loadAISettings();
  }, []);

  useEffect(() => {
    const off = EventsOn(AI_STREAM_EVENT, (payload: AIStreamEvent) => {
      if (!payload || typeof payload !== "object") {
        return;
      }
      const phase = String(payload.phase || "");
      if (phase === "start") {
        setAIStreamingText("");
        setAIStreamingProvider(String(payload.provider || ""));
        return;
      }
      if (phase === "chunk") {
        const delta = typeof payload.delta === "string" ? payload.delta : "";
        if (delta) {
          setAIStreamingText((prev) => prev + delta);
        }
        return;
      }
      if (phase === "status") {
        if (typeof payload.text === "string" && payload.text.trim()) {
          setNotice({ type: "ok", text: payload.text });
        }
        return;
      }
      if (phase === "done") {
        if (typeof payload.summary === "string" && payload.summary.trim()) {
          setAIStreamingText(payload.summary);
        }
        if (typeof payload.provider === "string" && payload.provider.trim()) {
          setAIStreamingProvider(payload.provider);
        }
        return;
      }
      if (phase === "error") {
        if (typeof payload.text === "string" && payload.text.trim()) {
          setNotice({ type: "err", text: payload.text });
        }
      }
    });
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    if (view === "attachments") {
      void loadAttachments();
    }
  }, [view, attachmentScope]);

  useEffect(() => {
    if (themes.length === 0) {
      setSelectedThemeID(0);
      setThemeLogs([]);
      return;
    }
    const exists = themes.some((item) => item.id === selectedThemeID);
    const nextThemeID = exists ? selectedThemeID : themes[0].id;
    if (nextThemeID !== selectedThemeID) {
      setSelectedThemeID(nextThemeID);
      return;
    }
    const t = themes.find((item) => item.id === nextThemeID);
    if (!t) {
      return;
    }
    setThemeMetaForm((prev) => ({
      ...prev,
      theme_id: t.id,
      heat_score: t.heat_score,
      lifecycle_stage: t.lifecycle_stage || "growth",
      is_pinned_main: t.is_pinned_main,
    }));
    void loadThemeLogs(nextThemeID);
  }, [themes, selectedThemeID]);

  useEffect(() => {
    if (!selectedThesisID) {
      setThesisReviews([]);
      setReviewForm((prev) => ({ ...prev, thesis_id: 0 }));
      return;
    }
    setReviewForm((prev) => ({ ...prev, thesis_id: selectedThesisID }));
    void loadThesisReviews(selectedThesisID);
  }, [selectedThesisID]);

  useEffect(() => {
    const q = globalQuery.trim();
    if (!q) {
      setGlobalResults([]);
      setGlobalOpen(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const rows = (await GlobalSearch(q)) as GlobalSearchItem[];
        setGlobalResults(rows);
        setGlobalOpen(true);
      } catch {
        setGlobalResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [globalQuery]);

  async function refreshAll() {
    setLoading(true);
    try {
      const [statsData, db, companyData, themeData, relationData] = await Promise.all([
        fetchStats(),
        DBPath(),
        ListCompanies(""),
        ListThemes(""),
        ListCompanyThemes(0, 0, false),
      ]);
      const relationRows = relationData as CompanyTheme[];
      const themeRows = themeData as Theme[];

      setStats(statsData as Stats);
      setDbPath(db);
      setCompanies(companyData as Company[]);
      setThemes(themeRows);
      setCompanyThemes(relationRows);

      if (!selectedCompanyThemeID && relationRows.length > 0) {
        const firstID = relationRows[0].id;
        setSelectedCompanyThemeID(firstID);
        setThesisForm((prev) => ({ ...prev, company_theme_id: firstID }));
        await loadTheses(firstID);
      } else if (selectedCompanyThemeID) {
        await loadTheses(selectedCompanyThemeID, selectedThesisID || undefined);
      }

      if (!selectedThemeID && themeRows.length > 0) {
        setSelectedThemeID(themeRows[0].id);
      }
    } catch (err) {
      setNotice({ type: "err", text: `刷新失败: ${String(err)}` });
    } finally {
      setLoading(false);
    }
  }

  async function loadAISettings() {
    try {
      const rows = (await GetAISettings()) as AISettings;
      const providers = Array.isArray((rows as any).providers) && (rows as any).providers.length > 0
        ? (rows as any).providers.map((item: any, idx: number) => ({
            id: item?.id || `provider-${idx + 1}`,
            name: item?.name || `中转站 ${idx + 1}`,
            base_url: item?.base_url || "https://api.openai.com/v1",
            api_key: item?.api_key || "",
            model: item?.model || "gpt-4.1",
            system_prompt: item?.system_prompt || "",
            request_mode: item?.request_mode === "responses" ? "responses" : "chat",
          }))
        : [
            {
              id: "default",
              name: "默认中转站",
              base_url: rows.base_url || "https://api.openai.com/v1",
              api_key: rows.api_key || "",
              model: rows.model || "gpt-4.1",
              system_prompt: rows.system_prompt || "",
              request_mode: "chat",
            },
          ];
      const activeProviderID = rows.active_provider_id || providers[0].id;
      setAISettings({
        base_url: rows.base_url || providers[0].base_url || "https://api.openai.com/v1",
        api_key: rows.api_key || providers[0].api_key || "",
        model: rows.model || providers[0].model || "gpt-4.1",
        system_prompt: rows.system_prompt || providers[0].system_prompt || "",
        providers,
        active_provider_id: activeProviderID,
      });
      setAIRuntimeProviderID(activeProviderID);
    } catch {
      // keep local defaults
    }
  }

  async function loadAttachments() {
    setAttachmentsLoading(true);
    try {
      const rows = (await ListAttachments({
        scope_type: attachmentScope === "all" ? "" : attachmentScope,
        scope_id: 0,
        query: attachmentQuery.trim(),
      } as any)) as Attachment[];
      setAttachments(rows);
    } catch {
      setAttachments([]);
    } finally {
      setAttachmentsLoading(false);
    }
  }

  async function loadTheses(companyThemeID: number, preferredThesisID?: number) {
    if (!companyThemeID) {
      setTheses([]);
      setSelectedThesisID(0);
      return;
    }
    try {
      const list = (await ListTheses(companyThemeID)) as Thesis[];
      setTheses(list);
      let nextThesisID = 0;
      if (preferredThesisID && list.some((item) => item.id === preferredThesisID)) {
        nextThesisID = preferredThesisID;
      } else if (list.length > 0) {
        nextThesisID = list[0].id;
      }
      setSelectedThesisID(nextThesisID);
    } catch {
      setTheses([]);
      setSelectedThesisID(0);
    }
  }

  async function loadThemeLogs(themeID: number) {
    if (!themeID) {
      setThemeLogs([]);
      return;
    }
    try {
      const logs = (await ListThemeChangeLogs(themeID)) as ThemeChangeLog[];
      setThemeLogs(logs);
    } catch {
      setThemeLogs([]);
    }
  }

  async function loadThesisReviews(thesisID: number) {
    if (!thesisID) {
      setThesisReviews([]);
      return;
    }
    try {
      const rows = (await ListThesisReviews(thesisID)) as ThesisReview[];
      setThesisReviews(rows);
    } catch {
      setThesisReviews([]);
    }
  }

  async function onCreateCompany(e: FormEvent) {
    e.preventDefault();
    try {
      await CreateCompany(companyForm);
      setCompanyForm({
        ts_code: "",
        company_name: "",
        industry_l1: "",
        industry_l2: "",
        listing_board: "主板",
      });
      setCompaniesPanel("list");
      setNotice({ type: "ok", text: "公司已新增" });
      await refreshAll();
    } catch (err) {
      setNotice({ type: "err", text: `新增公司失败: ${String(err)}` });
    }
  }

  function onOpenCompanyEdit(row: Company) {
    setCompanyEditForm({
      id: row.id,
      ts_code: row.ts_code || "",
      company_name: row.company_name || "",
      industry_l1: row.industry_l1 || "",
      industry_l2: row.industry_l2 || "",
      listing_board: row.listing_board || "主板",
    });
    setCompaniesPanel("edit");
  }

  async function onUpdateCompany(e: FormEvent) {
    e.preventDefault();
    if (!companyEditForm.id) {
      setNotice({ type: "err", text: "未选择要编辑的公司" });
      return;
    }
    try {
      await UpdateCompany(companyEditForm as any);
      setNotice({ type: "ok", text: "公司信息已更新" });
      setCompaniesPanel("list");
      await refreshAll();
    } catch (err) {
      setNotice({ type: "err", text: `编辑公司失败: ${String(err)}` });
    }
  }

  async function onCreateTheme(e: FormEvent) {
    e.preventDefault();
    try {
      await CreateTheme(themeForm);
      setThemeForm({
        theme_name: "",
        theme_type: "concept",
        description: "",
        lifecycle_stage: "growth",
        heat_score: 60,
      });
      setThemesPanel("manage");
      setNotice({ type: "ok", text: "题材已新增" });
      await refreshAll();
    } catch (err) {
      setNotice({ type: "err", text: `新增题材失败: ${String(err)}` });
    }
  }

  async function onUpdateThemeMeta(e: FormEvent) {
    e.preventDefault();
    if (!themeMetaForm.theme_id) {
      setNotice({ type: "err", text: "请先选择题材" });
      return;
    }
    try {
      await UpdateThemeMeta(themeMetaForm);
      setThemeMetaForm((prev) => ({ ...prev, change_note: "" }));
      setNotice({ type: "ok", text: "题材信息已更新，并记录变更日志" });
      await refreshAll();
      await loadThemeLogs(themeMetaForm.theme_id);
    } catch (err) {
      setNotice({ type: "err", text: `更新题材失败: ${String(err)}` });
    }
  }

  async function onLinkCompanyTheme(e: FormEvent) {
    e.preventDefault();
    if (!linkForm.company_id || !linkForm.theme_id) {
      setNotice({ type: "err", text: "请先选择公司和题材" });
      return;
    }
    try {
      await LinkCompanyTheme(linkForm);
      setMappingPanel("list");
      setNotice({ type: "ok", text: "公司与题材映射已保存" });
      await refreshAll();
    } catch (err) {
      setNotice({ type: "err", text: `保存映射失败: ${String(err)}` });
    }
  }

  async function onCreateThesis(e: FormEvent) {
    e.preventDefault();
    if (!thesisForm.company_theme_id) {
      setNotice({ type: "err", text: "请先选择公司题材关系" });
      return;
    }
    try {
      const newThesis = await CreateThesis(thesisForm);
      setNotice({ type: "ok", text: "投资逻辑已新增版本" });
      setThesisForm((prev) => ({
        ...prev,
        thesis_title: "",
        thesis_body: "",
        key_metrics: "",
      }));
      setThesisPanel("list");
      setSelectedCompanyThemeID(thesisForm.company_theme_id);
      await loadTheses(thesisForm.company_theme_id, (newThesis as Thesis).id);
      await refreshAll();
    } catch (err) {
      setNotice({ type: "err", text: `新增逻辑失败: ${String(err)}` });
    }
  }

  async function onCreateThesisReview(e: FormEvent) {
    e.preventDefault();
    if (!reviewForm.thesis_id) {
      setNotice({ type: "err", text: "请先选择逻辑版本" });
      return;
    }
    try {
      await CreateThesisReview(reviewForm);
      setReviewForm((prev) => ({
        ...prev,
        pnl_hint: "",
        review_note: "",
      }));
      setNotice({ type: "ok", text: "复盘记录已保存" });
      await loadThesisReviews(reviewForm.thesis_id);
    } catch (err) {
      setNotice({ type: "err", text: `保存复盘失败: ${String(err)}` });
    }
  }

  function updateProvider(providerID: string, patch: Partial<AIProvider>) {
    setAISettings((prev) => {
      const providers = (Array.isArray(prev.providers) ? prev.providers : []).map((item) =>
        item.id === providerID ? { ...item, ...patch } : item,
      );
      return { ...prev, providers };
    });
  }

  function onAddAIProvider() {
    const id = `provider-${Date.now()}`;
    setAISettings((prev) => {
      const providers = Array.isArray(prev.providers) ? [...prev.providers] : [];
      providers.push({
        id,
        name: `中转站 ${providers.length + 1}`,
        base_url: "https://api.openai.com/v1",
        api_key: "",
        model: prev.model || "gpt-4.1",
        system_prompt: prev.system_prompt || "",
        request_mode: "chat",
      });
      return { ...prev, providers, active_provider_id: id };
    });
    setAIRuntimeProviderID(id);
  }

  function onDeleteAIProvider() {
    setAISettings((prev) => {
      const providers = Array.isArray(prev.providers) ? prev.providers : [];
      if (providers.length <= 1) {
        return prev;
      }
      const next = providers.filter((item) => item.id !== prev.active_provider_id);
      const nextActive = next[0]?.id || "default";
      setAIRuntimeProviderID(nextActive);
      return { ...prev, providers: next, active_provider_id: nextActive };
    });
  }

  async function onSaveAISettings(e: FormEvent) {
    e.preventDefault();
    setAISaving(true);
    try {
      const providers = Array.isArray(aiSettings.providers) && aiSettings.providers.length > 0
        ? aiSettings.providers
        : [
            {
              id: "default",
              name: "默认中转站",
              base_url: aiSettings.base_url || "https://api.openai.com/v1",
              api_key: aiSettings.api_key || "",
              model: aiSettings.model || "gpt-4.1",
              system_prompt: aiSettings.system_prompt || "",
              request_mode: "chat",
            },
          ];
      const active = providers.find((item) => item.id === aiSettings.active_provider_id) || providers[0];
      const rows = (await SaveAISettings({
        ...aiSettings,
        base_url: active.base_url,
        api_key: active.api_key,
        model: active.model,
        system_prompt: active.system_prompt,
        providers,
        active_provider_id: active.id,
      } as any)) as AISettings;
      setAISettings(rows);
      if (rows.active_provider_id) {
        setAIRuntimeProviderID(rows.active_provider_id);
      }
      setNotice({ type: "ok", text: "AI 配置已保存" });
    } catch (err) {
      setNotice({ type: "err", text: `保存 AI 配置失败: ${String(err)}` });
    } finally {
      setAISaving(false);
    }
  }

  async function onPickAIFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    if (list.length === 0) {
      return;
    }

    const accepted: AIFileInput[] = [];
    const skipped: string[] = [];
    for (const file of list) {
      if (file.size > 10 * 1024 * 1024) {
        skipped.push(`${file.name} > 10MB`);
        continue;
      }
      try {
        const b64 = await fileToBase64(file);
        accepted.push({
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          base64_data: b64,
          size: file.size,
        });
      } catch {
        skipped.push(`${file.name} 读取失败`);
      }
    }

    if (accepted.length > 0) {
      setAIFiles((prev) => [...prev, ...accepted].slice(0, 8));
      setNotice({ type: "ok", text: `已加载 ${accepted.length} 个附件` });
    }
    if (skipped.length > 0) {
      setNotice({ type: "err", text: `以下附件未导入：${skipped.join("，")}` });
    }
    e.target.value = "";
  }

  function onRemoveAIFile(idx: number) {
    setAIFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onParseAI() {
    if (!aiText.trim() && aiFiles.length === 0) {
      setNotice({ type: "err", text: "请输入文字或上传至少一个附件" });
      return;
    }
    if (!runtimeAIProvider?.api_key) {
      setNotice({ type: "err", text: "当前中转站未配置 API Key，请先在设置页完善" });
      return;
    }

    setAIResult(null);
    setAIStreamingText("");
    setAIStreamingProvider("");
    setAIBusy(true);
    try {
      const rows = (await ParseThemeContent({
        user_text: aiText,
        files: aiFiles.map((item) => ({
          file_name: item.file_name,
          mime_type: item.mime_type,
          base64_data: item.base64_data,
        })),
        temperature: aiTemperature,
        max_output_tokens: aiMaxTokens,
        provider_id: aiRuntimeProviderID || aiSettings.active_provider_id,
      } as any)) as AIParseResult;
      setAIResult(rows);
      setAIStreamingText(rows.summary || "");
      setAIStreamingProvider(rows.provider || "");
      setAIStructuredJSON(rows.structured_json || "");
      setAIValidation(null);
      setAIImportResult(null);
      setNotice({ type: "ok", text: "AI 解析完成" });
      setView("ai");
    } catch (err) {
      setNotice({ type: "err", text: `AI 解析失败: ${String(err)}` });
    } finally {
      setAIBusy(false);
    }
  }

  async function onValidateAIImport() {
    if (!aiStructuredJSON.trim()) {
      setNotice({ type: "err", text: "请先生成或填写结构化 JSON" });
      return;
    }
    setAIValidating(true);
    try {
      const rows = (await ValidateAIImport({
        json_payload: aiStructuredJSON,
      } as any)) as AIImportValidation;
      const normalized: AIImportValidation = {
        is_valid: Boolean(rows?.is_valid),
        errors: Array.isArray(rows?.errors) ? rows.errors : [],
        warnings: Array.isArray(rows?.warnings) ? rows.warnings : [],
        normalized_json: rows?.normalized_json || "",
        estimated_writes: Number(rows?.estimated_writes || 0),
      };
      setAIValidation(normalized);
      if (normalized.normalized_json) {
        setAIStructuredJSON(normalized.normalized_json);
      }
      setNotice({
        type: normalized.is_valid ? "ok" : "err",
        text: normalized.is_valid ? "结构化校验通过" : "结构化校验未通过，请先修正错误",
      });
    } catch (err) {
      setNotice({ type: "err", text: `校验失败: ${String(err)}` });
    } finally {
      setAIValidating(false);
    }
  }

  async function onImportAIResult() {
    if (!aiStructuredJSON.trim()) {
      setNotice({ type: "err", text: "请先生成或填写结构化 JSON" });
      return;
    }
    setAIImporting(true);
    try {
      const rows = (await ImportAIParseResult({
        json_payload: aiStructuredJSON,
        files: aiFiles.map((item) => ({
          file_name: item.file_name,
          mime_type: item.mime_type,
          base64_data: item.base64_data,
        })),
        save_attachments: true,
        attachment_note: aiAttachmentNote,
      } as any)) as AIImportResult;
      setAIImportResult({
        ...rows,
        warnings: Array.isArray(rows?.warnings) ? rows.warnings : [],
      });
      setNotice({ type: "ok", text: "AI 结果已入库并归档附件" });
      setAIFiles([]);
      await refreshAll();
      if (view === "attachments") {
        await loadAttachments();
      }
    } catch (err) {
      setNotice({ type: "err", text: `一键入库失败: ${String(err)}` });
    } finally {
      setAIImporting(false);
    }
  }

  async function onOpenAttachmentPreview(id: number) {
    try {
      const rows = (await GetAttachmentPreview(id)) as AttachmentPreview;
      setAttachmentPreview(rows);
      setAttachmentPreviewOpen(true);
    } catch (err) {
      setNotice({ type: "err", text: `读取附件失败: ${String(err)}` });
    }
  }

  function applySearchResult(item: GlobalSearchItem) {
    const nextView = (item.target_view as ViewKey) || "overview";
    setView(nextView);

    if (item.type === "theme") {
      setSelectedThemeID(item.id);
    }
    if (item.company_theme_id > 0) {
      setSelectedCompanyThemeID(item.company_theme_id);
      setThesisForm((prev) => ({ ...prev, company_theme_id: item.company_theme_id }));
      void loadTheses(item.company_theme_id, item.thesis_id > 0 ? item.thesis_id : undefined);
    }

    setGlobalQuery("");
    setGlobalResults([]);
    setGlobalOpen(false);
  }

  const aiSummaryPreview = (aiResult?.summary || aiStreamingText).trim();
  const aiProviderLabel = aiResult?.provider || aiStreamingProvider || "-";
  const aiModelLabel = aiResult?.model || runtimeAIProvider?.model || aiSettings.model || "-";

  const viewMeta: Record<ViewKey, { title: string; desc: string }> = {
    overview: { title: "总览", desc: "查看核心统计与焦点关系" },
    companies: { title: "公司库", desc: "维护公司基础信息" },
    themes: { title: "题材库", desc: "热度/阶段/置顶与变更日志" },
    mapping: { title: "题材映射", desc: "维护公司与题材关系" },
    thesis: { title: "投资逻辑", desc: "逻辑版本与复盘记录" },
    ai: { title: "AI解析", desc: "多模态解析图片/PDF/文本并生成题材逻辑" },
    attachments: { title: "附件中心", desc: "归档并回看图片/PDF/文本原文" },
    settings: { title: "设置", desc: "配置模型参数与界面主题" },
  };

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-700 theme-${themePreset}`}>
      <div
        className="grid min-h-screen"
        style={{ gridTemplateColumns: sidebarCollapsed ? "72px 1fr" : "240px 1fr" }}
      >
        <aside className="flex flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-blue-500">A-Share Theme Library</p>
            {!sidebarCollapsed && (
              <>
                <h1 className="mt-1 text-lg font-semibold text-slate-800">A股题材库</h1>
                <p className="mt-1 text-xs text-slate-500">后台管理面板</p>
              </>
            )}
          </div>

          <nav className="space-y-1 p-3">
            {!sidebarCollapsed && <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">Menu</p>}
            <NavButton
              active={view === "overview"}
              collapsed={sidebarCollapsed}
              icon={<LayoutGrid className="h-4 w-4" />}
              label="总览"
              onClick={() => setView("overview")}
            />
            <NavButton
              active={view === "companies"}
              collapsed={sidebarCollapsed}
              icon={<Building2 className="h-4 w-4" />}
              label="公司库"
              onClick={() => setView("companies")}
            />
            <NavButton
              active={view === "themes"}
              collapsed={sidebarCollapsed}
              icon={<Tags className="h-4 w-4" />}
              label="题材库"
              onClick={() => setView("themes")}
            />
            <NavButton
              active={view === "mapping"}
              collapsed={sidebarCollapsed}
              icon={<Link2 className="h-4 w-4" />}
              label="题材映射"
              onClick={() => setView("mapping")}
            />
            <NavButton
              active={view === "thesis"}
              collapsed={sidebarCollapsed}
              icon={<FileText className="h-4 w-4" />}
              label="投资逻辑"
              onClick={() => setView("thesis")}
            />
            <NavButton
              active={view === "ai"}
              collapsed={sidebarCollapsed}
              icon={<Bot className="h-4 w-4" />}
              label="AI解析"
              onClick={() => setView("ai")}
            />
            <NavButton
              active={view === "attachments"}
              collapsed={sidebarCollapsed}
              icon={<Paperclip className="h-4 w-4" />}
              label="附件中心"
              onClick={() => setView("attachments")}
            />
            <NavButton
              active={view === "settings"}
              collapsed={sidebarCollapsed}
              icon={<Settings2 className="h-4 w-4" />}
              label="设置"
              onClick={() => setView("settings")}
            />
          </nav>

          {!sidebarCollapsed && (
            <div className="mt-auto border-t border-slate-100 p-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Database</p>
              <p className="mt-1 truncate text-xs text-slate-500">{dbPath || "加载中..."}</p>
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => setSidebarCollapsed((prev) => !prev)}>
                  {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{viewMeta[view].title}</h2>
                  <p className="text-xs text-slate-500">{viewMeta[view].desc}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-[340px]" onBlur={() => window.setTimeout(() => setGlobalOpen(false), 120)}>
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    value={globalQuery}
                    onFocus={() => {
                      if (globalResults.length > 0) {
                        setGlobalOpen(true);
                      }
                    }}
                    onChange={(e) => setGlobalQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && globalResults.length > 0) {
                        e.preventDefault();
                        applySearchResult(globalResults[0]);
                      }
                    }}
                    placeholder="全局搜索：公司/题材/映射/逻辑"
                    className="pl-9"
                  />
                  {globalOpen && (
                    <Card className="absolute right-0 top-12 z-50 w-full border-slate-200 shadow-lg">
                      <CardContent className="max-h-72 overflow-auto p-2">
                        {searching && <p className="px-2 py-2 text-sm text-slate-500">搜索中...</p>}
                        {!searching && globalResults.length === 0 && <p className="px-2 py-2 text-sm text-slate-500">无匹配结果</p>}
                        {!searching &&
                          globalResults.map((item) => (
                            <button
                              key={`${item.type}-${item.id}-${item.company_theme_id}-${item.thesis_id}`}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                applySearchResult(item);
                              }}
                              className="w-full rounded-lg px-2 py-2 text-left transition hover:bg-blue-50"
                            >
                              <p className="text-sm font-medium text-slate-700">{item.title}</p>
                              <p className="text-xs text-slate-500">{item.subtitle}</p>
                            </button>
                          ))}
                      </CardContent>
                    </Card>
                  )}
                </div>

                <Button type="button" onClick={() => void refreshAll()} disabled={loading}>
                  {loading ? "刷新中..." : "刷新数据"}
                </Button>
              </div>
            </div>

            {notice && noticeView === view && (
              <div className="px-4 pb-3 md:px-6">
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    notice.type === "ok"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="leading-6">{notice.text}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1 text-current hover:bg-black/5"
                      onClick={() => setNotice(null)}
                      aria-label="关闭提示"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </header>

          <main className="p-4 md:p-6">
            <section className="mx-auto max-w-[1180px]">
              {view === "overview" && (
                <div className="space-y-5">
                  <Card>
                    <CardHeader>
                      <CardTitle>核心统计</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {loading && !stats ? (
                          <>
                            <StatSkeleton />
                            <StatSkeleton />
                            <StatSkeleton />
                            <StatSkeleton />
                          </>
                        ) : (
                          <>
                            <StatCard label="公司数" value={stats?.company_count ?? 0} />
                            <StatCard label="题材数" value={stats?.theme_count ?? 0} />
                            <StatCard label="映射数" value={stats?.company_theme_rows ?? 0} />
                            <StatCard label="活跃逻辑" value={stats?.active_thesis_rows ?? 0} />
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>当前焦点关系</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedRelation ? (
                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                          <p className="text-sm font-medium text-slate-700">
                            {selectedRelation.company_name} / {selectedRelation.theme_name}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">代码: {selectedRelation.ts_code}</p>
                          <div className="mt-3 flex gap-2">
                            <Badge>相关性 {selectedRelation.relevance_score}</Badge>
                            <Badge variant={selectedRelation.is_primary ? "default" : "muted"}>
                              {selectedRelation.is_primary ? "主线" : "非主线"}
                            </Badge>
                          </div>
                        </div>
                      ) : (
                        <EmptyState
                          title="暂无关系数据"
                          desc="先去“题材映射”页新增一条公司题材关系。"
                          icon={<FileSearch className="h-5 w-5 text-blue-500" />}
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {view === "companies" && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => setCompaniesPanel("create")}>
                      新增公司
                    </Button>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>公司列表</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[640px] overflow-auto rounded-xl border border-blue-100">
                        <Table>
                          <TableHeader className="sticky top-0 bg-blue-50">
                            <TableRow className="hover:bg-blue-50">
                              <TableHead>公司</TableHead>
                              <TableHead>代码</TableHead>
                              <TableHead>板块</TableHead>
                              <TableHead className="w-[96px]">操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {companies.map((row) => (
                              <TableRow key={row.id} className="hover:bg-transparent">
                                <TableCell>{row.company_name}</TableCell>
                                <TableCell className="text-slate-500">{row.ts_code || "-"}</TableCell>
                                <TableCell className="text-slate-500">{row.listing_board || "-"}</TableCell>
                                <TableCell>
                                  <Button type="button" size="sm" variant="outline" onClick={() => onOpenCompanyEdit(row)}>
                                    编辑
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  <ModalShell open={companiesPanel === "create"} title="新增公司" size="md" onClose={() => setCompaniesPanel("list")}>
                    <form className="space-y-3" onSubmit={onCreateCompany}>
                      <Label htmlFor="ts_code">证券代码</Label>
                      <Input
                        id="ts_code"
                        value={companyForm.ts_code}
                        placeholder="证券代码 300308.SZ"
                        onChange={(e) => setCompanyForm((s) => ({ ...s, ts_code: e.target.value }))}
                      />
                      <Label htmlFor="company_name">公司简称</Label>
                      <Input
                        id="company_name"
                        value={companyForm.company_name}
                        placeholder="公司简称"
                        onChange={(e) => setCompanyForm((s) => ({ ...s, company_name: e.target.value }))}
                      />
                      <Label htmlFor="industry_l1">一级行业</Label>
                      <Input
                        id="industry_l1"
                        value={companyForm.industry_l1}
                        placeholder="一级行业"
                        onChange={(e) => setCompanyForm((s) => ({ ...s, industry_l1: e.target.value }))}
                      />
                      <Label htmlFor="industry_l2">二级行业</Label>
                      <Input
                        id="industry_l2"
                        value={companyForm.industry_l2}
                        placeholder="二级行业"
                        onChange={(e) => setCompanyForm((s) => ({ ...s, industry_l2: e.target.value }))}
                      />
                      <Label>上市板块</Label>
                      <Select
                        value={companyForm.listing_board}
                        onValueChange={(value) => setCompanyForm((s) => ({ ...s, listing_board: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择板块" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="主板">主板</SelectItem>
                          <SelectItem value="创业板">创业板</SelectItem>
                          <SelectItem value="科创板">科创板</SelectItem>
                          <SelectItem value="北交所">北交所</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button type="submit" className="mt-2 w-full">
                        保存公司
                      </Button>
                    </form>
                  </ModalShell>

                  <ModalShell open={companiesPanel === "edit"} title="编辑公司" size="md" onClose={() => setCompaniesPanel("list")}>
                    <form className="space-y-3" onSubmit={onUpdateCompany}>
                      <Label htmlFor="edit_ts_code">证券代码</Label>
                      <Input
                        id="edit_ts_code"
                        value={companyEditForm.ts_code}
                        placeholder="未识别时可暂时留空，后续手动补充"
                        onChange={(e) => setCompanyEditForm((s) => ({ ...s, ts_code: e.target.value }))}
                      />
                      <Label htmlFor="edit_company_name">公司简称</Label>
                      <Input
                        id="edit_company_name"
                        value={companyEditForm.company_name}
                        placeholder="公司简称"
                        onChange={(e) => setCompanyEditForm((s) => ({ ...s, company_name: e.target.value }))}
                      />
                      <Label htmlFor="edit_industry_l1">一级行业</Label>
                      <Input
                        id="edit_industry_l1"
                        value={companyEditForm.industry_l1}
                        placeholder="一级行业"
                        onChange={(e) => setCompanyEditForm((s) => ({ ...s, industry_l1: e.target.value }))}
                      />
                      <Label htmlFor="edit_industry_l2">二级行业</Label>
                      <Input
                        id="edit_industry_l2"
                        value={companyEditForm.industry_l2}
                        placeholder="二级行业"
                        onChange={(e) => setCompanyEditForm((s) => ({ ...s, industry_l2: e.target.value }))}
                      />
                      <Label>上市板块</Label>
                      <Select
                        value={companyEditForm.listing_board || "主板"}
                        onValueChange={(value) => setCompanyEditForm((s) => ({ ...s, listing_board: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择板块" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="主板">主板</SelectItem>
                          <SelectItem value="创业板">创业板</SelectItem>
                          <SelectItem value="科创板">科创板</SelectItem>
                          <SelectItem value="北交所">北交所</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button type="submit" className="mt-2 w-full">
                        保存修改
                      </Button>
                    </form>
                  </ModalShell>
                </div>
              )}

              {view === "themes" && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => setThemesPanel("create")}>
                      新增题材
                    </Button>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>题材管理（热度/阶段/置顶）</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <form className="grid gap-3 md:grid-cols-2" onSubmit={onUpdateThemeMeta}>
                          <div className="md:col-span-2">
                            <Label>选择题材</Label>
                            <Select
                              value={themeMetaForm.theme_id ? String(themeMetaForm.theme_id) : ""}
                              onValueChange={(value) => setSelectedThemeID(Number(value))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="选择题材" />
                              </SelectTrigger>
                              <SelectContent>
                                {themes.map((item) => (
                                  <SelectItem key={item.id} value={String(item.id)}>
                                    {item.theme_name} · 热度 {item.heat_score}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label htmlFor="meta_heat">热度</Label>
                            <Input
                              id="meta_heat"
                              value={String(themeMetaForm.heat_score)}
                              onChange={(e) =>
                                setThemeMetaForm((prev) => ({
                                  ...prev,
                                  heat_score: Number(e.target.value) || 0,
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label>生命周期</Label>
                            <Select
                              value={themeMetaForm.lifecycle_stage}
                              onValueChange={(value) => setThemeMetaForm((prev) => ({ ...prev, lifecycle_stage: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="选择阶段" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="early">early</SelectItem>
                                <SelectItem value="growth">growth</SelectItem>
                                <SelectItem value="mature">mature</SelectItem>
                                <SelectItem value="decline">decline</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="md:col-span-2 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                            <Switch
                              checked={themeMetaForm.is_pinned_main}
                              onCheckedChange={(checked) => setThemeMetaForm((prev) => ({ ...prev, is_pinned_main: checked }))}
                            />
                            <span className="text-sm text-slate-600">手动置顶主线题材</span>
                          </div>

                          <div className="md:col-span-2">
                            <Label htmlFor="meta_note">变更说明</Label>
                            <Textarea
                              id="meta_note"
                              value={themeMetaForm.change_note}
                              placeholder="例如：行业景气上行，提升热度并置顶"
                              onChange={(e) => setThemeMetaForm((prev) => ({ ...prev, change_note: e.target.value }))}
                            />
                          </div>

                          <div className="md:col-span-2">
                            <Button type="submit" className="w-full">
                              保存题材管理变更
                            </Button>
                          </div>
                        </form>

                        <div className="grid gap-3 lg:grid-cols-2">
                          <Card className="border-blue-100 shadow-none">
                            <CardHeader>
                              <CardTitle>题材列表</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="max-h-72 overflow-auto rounded-xl border border-blue-100">
                                <Table>
                                  <TableHeader className="sticky top-0 bg-blue-50">
                                    <TableRow className="hover:bg-blue-50">
                                      <TableHead>题材</TableHead>
                                      <TableHead>热度</TableHead>
                                      <TableHead>阶段</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {themes.map((row) => (
                                      <TableRow
                                        key={row.id}
                                        data-state={row.id === selectedThemeID ? "selected" : undefined}
                                        className="cursor-pointer"
                                        onClick={() => setSelectedThemeID(row.id)}
                                      >
                                        <TableCell>
                                          <div className="flex items-center gap-1">
                                            <span>{row.theme_name}</span>
                                            {row.is_pinned_main && <Badge>置顶</Badge>}
                                          </div>
                                        </TableCell>
                                        <TableCell>{row.heat_score}</TableCell>
                                        <TableCell className="text-slate-500">{row.lifecycle_stage}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border-blue-100 shadow-none">
                            <CardHeader>
                              <CardTitle>变更日志</CardTitle>
                            </CardHeader>
                            <CardContent>
                              {!selectedTheme && <p className="text-sm text-slate-500">请先选择题材查看日志。</p>}
                              {selectedTheme && (
                                <div className="max-h-72 overflow-auto rounded-xl border border-blue-100">
                                  <Table>
                                    <TableHeader className="sticky top-0 bg-blue-50">
                                      <TableRow className="hover:bg-blue-50">
                                        <TableHead>时间</TableHead>
                                        <TableHead>变更</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {themeLogs.map((log) => (
                                        <TableRow key={log.id} className="hover:bg-transparent">
                                          <TableCell className="text-xs text-slate-500">{log.created_at}</TableCell>
                                          <TableCell>
                                            <div className="text-xs text-slate-600">
                                              热度 {log.old_heat_score} → {log.new_heat_score}
                                            </div>
                                            <div className="text-xs text-slate-600">
                                              阶段 {log.old_lifecycle_stage} → {log.new_lifecycle_stage}
                                            </div>
                                            <div className="text-xs text-slate-600">
                                              置顶 {log.old_is_pinned_main ? "是" : "否"} → {log.new_is_pinned_main ? "是" : "否"}
                                            </div>
                                            {log.change_note && <div className="mt-1 text-xs text-slate-500">备注: {log.change_note}</div>}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                      {themeLogs.length === 0 && (
                                        <TableRow className="hover:bg-transparent">
                                          <TableCell colSpan={2} className="py-6 text-center text-sm text-slate-500">
                                            暂无变更日志
                                          </TableCell>
                                        </TableRow>
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                    </CardContent>
                  </Card>

                  <ModalShell open={themesPanel === "create"} title="新增题材" size="md" onClose={() => setThemesPanel("manage")}>
                    <form className="space-y-3" onSubmit={onCreateTheme}>
                      <Label htmlFor="theme_name">题材名</Label>
                      <Input
                        id="theme_name"
                        value={themeForm.theme_name}
                        placeholder="题材名"
                        onChange={(e) => setThemeForm((s) => ({ ...s, theme_name: e.target.value }))}
                      />
                      <Label>题材类型</Label>
                      <Select value={themeForm.theme_type} onValueChange={(value) => setThemeForm((s) => ({ ...s, theme_type: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择类型" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="concept">concept</SelectItem>
                          <SelectItem value="policy">policy</SelectItem>
                          <SelectItem value="cycle">cycle</SelectItem>
                        </SelectContent>
                      </Select>
                      <Label>生命周期</Label>
                      <Select
                        value={themeForm.lifecycle_stage}
                        onValueChange={(value) => setThemeForm((s) => ({ ...s, lifecycle_stage: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择阶段" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="early">early</SelectItem>
                          <SelectItem value="growth">growth</SelectItem>
                          <SelectItem value="mature">mature</SelectItem>
                          <SelectItem value="decline">decline</SelectItem>
                        </SelectContent>
                      </Select>
                      <Label htmlFor="heat_score">热度（0-100）</Label>
                      <Input
                        id="heat_score"
                        value={String(themeForm.heat_score)}
                        placeholder="热度 0-100"
                        onChange={(e) => setThemeForm((s) => ({ ...s, heat_score: Number(e.target.value) || 0 }))}
                      />
                      <Label htmlFor="theme_desc">题材定义</Label>
                      <Textarea
                        id="theme_desc"
                        value={themeForm.description}
                        placeholder="题材定义"
                        onChange={(e) => setThemeForm((s) => ({ ...s, description: e.target.value }))}
                      />
                      <Button type="submit" className="mt-2 w-full">
                        保存题材
                      </Button>
                    </form>
                  </ModalShell>
                </div>
              )}

              {view === "mapping" && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => setMappingPanel("create")}>
                      新增映射
                    </Button>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>映射列表</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <Input
                              value={relationQuery}
                              onChange={(e) => setRelationQuery(e.target.value)}
                              placeholder="搜索公司/代码/题材"
                              className="pl-9"
                            />
                          </div>
                          <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3">
                            <Switch checked={primaryOnlyFilter} onCheckedChange={setPrimaryOnlyFilter} />
                            <span className="text-sm text-slate-600">仅主线</span>
                          </div>
                          <Button
                            variant="outline"
                            type="button"
                            onClick={() => {
                              setRelationQuery("");
                              setPrimaryOnlyFilter(false);
                            }}
                            disabled={!relationQuery && !primaryOnlyFilter}
                          >
                            <FunnelX className="mr-1 h-4 w-4" />
                            清空筛选
                          </Button>
                        </div>

                        <div className="max-h-[640px] overflow-auto rounded-xl border border-blue-100">
                          <Table>
                            <TableHeader className="sticky top-0 bg-blue-50">
                              <TableRow className="hover:bg-blue-50">
                                <TableHead>公司</TableHead>
                                <TableHead>题材</TableHead>
                                <TableHead>相关性</TableHead>
                                <TableHead>主线</TableHead>
                                <TableHead>最新逻辑</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredCompanyThemes.map((row) => (
                                <TableRow
                                  key={row.id}
                                  data-state={selectedCompanyThemeID === row.id ? "selected" : undefined}
                                  onClick={() => {
                                    setSelectedCompanyThemeID(row.id);
                                    setThesisForm((prev) => ({ ...prev, company_theme_id: row.id }));
                                  }}
                                  className="cursor-pointer"
                                >
                                  <TableCell>
                                    <div>{row.company_name}</div>
                                    <div className="text-xs text-slate-400">{row.ts_code}</div>
                                  </TableCell>
                                  <TableCell>{row.theme_name}</TableCell>
                                  <TableCell>
                                    <Badge>{row.relevance_score}</Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={row.is_primary ? "default" : "muted"}>{row.is_primary ? "是" : "否"}</Badge>
                                  </TableCell>
                                  <TableCell className="text-slate-500">{row.latest_thesis_title || "-"}</TableCell>
                                </TableRow>
                              ))}
                              {filteredCompanyThemes.length === 0 && (
                                <TableRow className="hover:bg-transparent">
                                  <TableCell colSpan={5} className="py-10">
                                    <EmptyState
                                      title="没有匹配的映射记录"
                                      desc="调整搜索词或关闭“仅主线”筛选后重试。"
                                      icon={<FileSearch className="h-5 w-5 text-blue-500" />}
                                    />
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                    </CardContent>
                  </Card>

                  <ModalShell open={mappingPanel === "create"} title="新增公司题材映射" size="md" onClose={() => setMappingPanel("list")}>
                    <form className="space-y-3" onSubmit={onLinkCompanyTheme}>
                      <Label>选择公司</Label>
                      <Select
                        value={linkForm.company_id ? String(linkForm.company_id) : ""}
                        onValueChange={(value) => setLinkForm((s) => ({ ...s, company_id: Number(value) }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择公司" />
                        </SelectTrigger>
                        <SelectContent>
                          {companies.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {item.company_name} ({item.ts_code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Label>选择题材</Label>
                      <Select
                        value={linkForm.theme_id ? String(linkForm.theme_id) : ""}
                        onValueChange={(value) => setLinkForm((s) => ({ ...s, theme_id: Number(value) }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择题材" />
                        </SelectTrigger>
                        <SelectContent>
                          {themes.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {item.theme_name} · {item.theme_type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Label htmlFor="relevance_score">相关性评分（0-100）</Label>
                      <Input
                        id="relevance_score"
                        value={String(linkForm.relevance_score)}
                        placeholder="相关性评分 0-100"
                        onChange={(e) => setLinkForm((s) => ({ ...s, relevance_score: Number(e.target.value) || 0 }))}
                      />
                      <Label htmlFor="role_chain">产业链角色</Label>
                      <Input
                        id="role_chain"
                        value={linkForm.role_in_chain}
                        placeholder="产业链角色"
                        onChange={(e) => setLinkForm((s) => ({ ...s, role_in_chain: e.target.value }))}
                      />
                      <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                        <Switch
                          id="is_primary"
                          checked={linkForm.is_primary}
                          onCheckedChange={(checked) => setLinkForm((s) => ({ ...s, is_primary: checked }))}
                        />
                        <Label htmlFor="is_primary" className="text-sm normal-case tracking-normal text-slate-600">
                          主线题材
                        </Label>
                      </div>
                      <Label htmlFor="evidence_summary">归因证据</Label>
                      <Textarea
                        id="evidence_summary"
                        value={linkForm.evidence_summary}
                        placeholder="归因证据"
                        onChange={(e) => setLinkForm((s) => ({ ...s, evidence_summary: e.target.value }))}
                      />
                      <Button type="submit" className="mt-2 w-full">
                        保存映射
                      </Button>
                    </form>
                  </ModalShell>
                </div>
              )}

              {view === "thesis" && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => setThesisPanel("create")}>
                      新增逻辑版本
                    </Button>
                  </div>

                  <div className="space-y-5">
                    <Card>
                        <CardHeader>
                          <CardTitle>逻辑版本列表</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {selectedRelation && (
                            <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                              <p className="text-sm font-medium text-slate-700">
                                当前关系：{selectedRelation.company_name} / {selectedRelation.theme_name}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">{selectedRelation.ts_code}</p>
                            </div>
                          )}

                          <div className="grid gap-3 lg:grid-cols-2">
                            {loading && theses.length === 0 && (
                              <>
                                <ThesisSkeleton />
                                <ThesisSkeleton />
                              </>
                            )}
                            {!loading && theses.length === 0 && (
                              <div className="rounded-lg border border-dashed border-blue-200 bg-white p-4 text-sm text-slate-500">
                                暂无逻辑记录，先切到“新增逻辑版本”创建第一条。
                              </div>
                            )}
                            {theses.map((item) => (
                              <Card
                                key={item.id}
                                className={`cursor-pointer border-blue-100 shadow-none ${selectedThesisID === item.id ? "ring-2 ring-blue-200" : ""}`}
                                onClick={() => setSelectedThesisID(item.id)}
                              >
                                <CardContent className="p-4">
                                  <div className="mb-2 flex items-center justify-between">
                                    <h3 className="font-medium text-slate-700">
                                      V{item.thesis_version}. {item.thesis_title}
                                    </h3>
                                    <Badge>{item.confidence_level}</Badge>
                                  </div>
                                  <p className="max-h-24 overflow-hidden text-sm leading-6 text-slate-600">{item.thesis_body}</p>
                                  <div className="mt-3 text-xs text-slate-400">
                                    周期: {item.expected_timeline || "-"} | 创建: {item.created_at}
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>逻辑复盘</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreateThesisReview}>
                            <div className="md:col-span-2">
                              <Label>当前逻辑版本</Label>
                              <Select
                                value={reviewForm.thesis_id ? String(reviewForm.thesis_id) : ""}
                                onValueChange={(value) => setSelectedThesisID(Number(value))}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="选择逻辑版本" />
                                </SelectTrigger>
                                <SelectContent>
                                  {theses.map((item) => (
                                    <SelectItem key={item.id} value={String(item.id)}>
                                      V{item.thesis_version} · {item.thesis_title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label htmlFor="review_date">复盘日期</Label>
                              <Input
                                id="review_date"
                                type="date"
                                value={reviewForm.review_date}
                                onChange={(e) => setReviewForm((prev) => ({ ...prev, review_date: e.target.value }))}
                              />
                            </div>
                            <div>
                              <Label>复盘结论</Label>
                              <Select
                                value={reviewForm.review_result}
                                onValueChange={(value) => setReviewForm((prev) => ({ ...prev, review_result: value }))}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="选择结果" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="validated">validated</SelectItem>
                                  <SelectItem value="partially_valid">partially_valid</SelectItem>
                                  <SelectItem value="invalid">invalid</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label htmlFor="pnl_hint">收益提示</Label>
                              <Input
                                id="pnl_hint"
                                placeholder="例如 +12%"
                                value={reviewForm.pnl_hint}
                                onChange={(e) => setReviewForm((prev) => ({ ...prev, pnl_hint: e.target.value }))}
                              />
                            </div>
                            <div className="md:col-span-2">
                              <Label htmlFor="review_note">复盘说明</Label>
                              <Textarea
                                id="review_note"
                                placeholder="本次复盘结论与证据"
                                value={reviewForm.review_note}
                                onChange={(e) => setReviewForm((prev) => ({ ...prev, review_note: e.target.value }))}
                              />
                            </div>

                            <div className="md:col-span-2">
                              <Button type="submit" className="w-full">
                                保存复盘记录
                              </Button>
                            </div>
                          </form>

                          <div className="max-h-72 overflow-auto rounded-xl border border-blue-100">
                            <Table>
                              <TableHeader className="sticky top-0 bg-blue-50">
                                <TableRow className="hover:bg-blue-50">
                                  <TableHead>日期</TableHead>
                                  <TableHead>结论</TableHead>
                                  <TableHead>收益</TableHead>
                                  <TableHead>说明</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {thesisReviews.map((row) => (
                                  <TableRow key={row.id} className="hover:bg-transparent">
                                    <TableCell className="text-xs text-slate-500">{row.review_date}</TableCell>
                                    <TableCell>
                                      <ReviewBadge result={row.review_result} />
                                    </TableCell>
                                    <TableCell className="text-slate-600">{row.pnl_hint || "-"}</TableCell>
                                    <TableCell className="text-slate-500">{row.review_note || "-"}</TableCell>
                                  </TableRow>
                                ))}
                                {thesisReviews.length === 0 && (
                                  <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={4} className="py-6 text-center text-sm text-slate-500">
                                      暂无复盘记录
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                  <ModalShell open={thesisPanel === "create"} title="新增投资逻辑版本" size="lg" onClose={() => setThesisPanel("list")}>
                    <form className="space-y-3" onSubmit={onCreateThesis}>
                      <Label>公司题材关系</Label>
                      <Select
                        value={thesisForm.company_theme_id ? String(thesisForm.company_theme_id) : ""}
                        onValueChange={(value) => {
                          const id = Number(value);
                          setThesisForm((s) => ({ ...s, company_theme_id: id }));
                          setSelectedCompanyThemeID(id);
                          void loadTheses(id);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择公司题材关系" />
                        </SelectTrigger>
                        <SelectContent>
                          {companyThemeOptions.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Label htmlFor="thesis_title">逻辑标题</Label>
                      <Input
                        id="thesis_title"
                        value={thesisForm.thesis_title}
                        placeholder="逻辑标题"
                        onChange={(e) => setThesisForm((s) => ({ ...s, thesis_title: e.target.value }))}
                      />
                      <Label htmlFor="thesis_body">逻辑正文</Label>
                      <Textarea
                        id="thesis_body"
                        rows={5}
                        value={thesisForm.thesis_body}
                        placeholder="逻辑正文"
                        onChange={(e) => setThesisForm((s) => ({ ...s, thesis_body: e.target.value }))}
                      />
                      <Label htmlFor="key_metrics">关键指标</Label>
                      <Textarea
                        id="key_metrics"
                        value={thesisForm.key_metrics}
                        placeholder='关键指标（JSON字符串或文本），例如 {"营收增速":"同比>30%"}'
                        onChange={(e) => setThesisForm((s) => ({ ...s, key_metrics: e.target.value }))}
                      />
                      <Label htmlFor="expected_timeline">兑现周期</Label>
                      <Input
                        id="expected_timeline"
                        value={thesisForm.expected_timeline}
                        placeholder="兑现周期"
                        onChange={(e) => setThesisForm((s) => ({ ...s, expected_timeline: e.target.value }))}
                      />
                      <Label>置信度</Label>
                      <Select
                        value={thesisForm.confidence_level}
                        onValueChange={(value) => setThesisForm((s) => ({ ...s, confidence_level: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择置信度" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">high</SelectItem>
                          <SelectItem value="medium">medium</SelectItem>
                          <SelectItem value="low">low</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button type="submit" className="mt-2 w-full">
                        保存逻辑版本
                      </Button>
                    </form>
                  </ModalShell>
                </div>
              )}

              {view === "settings" && (
                <div className="grid gap-5 xl:grid-cols-3">
                  <Card className="xl:col-span-1">
                    <CardHeader>
                      <CardTitle>界面主题色</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-slate-500">选择全局主色后，按钮、卡片、徽标和重点提示会同步切换。</p>
                      <button
                        type="button"
                        onClick={() => setThemePreset("blue")}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${themePreset === "blue" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-blue-600" />
                          蓝色
                        </span>
                        {themePreset === "blue" && <Badge>当前</Badge>}
                      </button>
                      <button
                        type="button"
                        onClick={() => setThemePreset("emerald")}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${themePreset === "emerald" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-emerald-600" />
                          翡翠绿
                        </span>
                        {themePreset === "emerald" && <Badge>当前</Badge>}
                      </button>
                      <button
                        type="button"
                        onClick={() => setThemePreset("indigo")}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${themePreset === "indigo" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-indigo-600" />
                          靛青
                        </span>
                        {themePreset === "indigo" && <Badge>当前</Badge>}
                      </button>
                      <button
                        type="button"
                        onClick={() => setThemePreset("slate")}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${themePreset === "slate" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-slate-700" />
                          石墨灰蓝
                        </span>
                        {themePreset === "slate" && <Badge>当前</Badge>}
                      </button>
                    </CardContent>
                  </Card>

                  <div className="space-y-5 xl:col-span-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>AI 模型配置</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <form className="space-y-3" onSubmit={onSaveAISettings}>
                          <Label>默认中转站</Label>
                          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                            <Select
                              value={aiSettings.active_provider_id || activeAIProvider.id}
                              onValueChange={(value) => {
                                setAISettings((prev) => ({ ...prev, active_provider_id: value }));
                                setAIRuntimeProviderID(value);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="选择中转站" />
                              </SelectTrigger>
                              <SelectContent>
                                {aiProviders.map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button type="button" variant="outline" onClick={onAddAIProvider}>
                              新增中转站
                            </Button>
                            <Button type="button" variant="outline" onClick={onDeleteAIProvider} disabled={aiProviders.length <= 1}>
                              删除当前
                            </Button>
                          </div>

                          <Label htmlFor="ai_provider_name">中转站名称</Label>
                          <Input
                            id="ai_provider_name"
                            value={activeAIProvider?.name || ""}
                            placeholder="例如：主中转站"
                            onChange={(e) => updateProvider(activeAIProvider.id, { name: e.target.value })}
                          />

                          <Label htmlFor="ai_base_url">Base URL</Label>
                          <Input
                            id="ai_base_url"
                            value={activeAIProvider?.base_url || ""}
                            placeholder="https://api.openai.com/v1"
                            onChange={(e) => updateProvider(activeAIProvider.id, { base_url: e.target.value })}
                          />

                          <Label htmlFor="ai_model">Model</Label>
                          <Input
                            id="ai_model"
                            value={activeAIProvider?.model || ""}
                            placeholder="gpt-4.1"
                            onChange={(e) => updateProvider(activeAIProvider.id, { model: e.target.value })}
                          />

                          <Label>请求通道</Label>
                          <Select
                            value={activeAIProvider?.request_mode || "chat"}
                            onValueChange={(value) => updateProvider(activeAIProvider.id, { request_mode: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="选择请求通道" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="chat">chat.completions（兼容模式）</SelectItem>
                              <SelectItem value="responses">responses（文件直传）</SelectItem>
                            </SelectContent>
                          </Select>
                          {activeAIProvider?.request_mode === "responses" && (
                            <p className="text-xs text-slate-500">responses 模式会把 PDF/文件按原始文件上传给模型，要求中转站支持该接口。</p>
                          )}

                          <Label htmlFor="ai_api_key">API Key</Label>
                          <Input
                            id="ai_api_key"
                            type="password"
                            value={activeAIProvider?.api_key || ""}
                            placeholder="sk-..."
                            onChange={(e) => updateProvider(activeAIProvider.id, { api_key: e.target.value })}
                          />

                          <Label htmlFor="ai_system_prompt">System Prompt</Label>
                          <Textarea
                            id="ai_system_prompt"
                            rows={8}
                            value={activeAIProvider?.system_prompt || ""}
                            placeholder="自定义解析风格和输出格式"
                            onChange={(e) => updateProvider(activeAIProvider.id, { system_prompt: e.target.value })}
                          />
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <Label htmlFor="ai_temp">默认 Temperature</Label>
                              <Input
                                id="ai_temp"
                                value={String(aiTemperature)}
                                onChange={(e) => setAITemperature(Number(e.target.value) || 0.2)}
                              />
                            </div>
                            <div>
                              <Label htmlFor="ai_max_tokens">默认最大 Tokens</Label>
                              <Input
                                id="ai_max_tokens"
                                value={String(aiMaxTokens)}
                                onChange={(e) => setAIMaxTokens(Number(e.target.value) || 1800)}
                              />
                            </div>
                          </div>
                          <Button type="submit" className="w-full" disabled={aiSaving}>
                            {aiSaving ? "保存中..." : "保存设置"}
                          </Button>
                        </form>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {view === "ai" && (
                <div className="space-y-5">
                  <Card>
                    <CardHeader>
                      <CardTitle>输入内容（文字/图片/PDF）</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {!runtimeAIProvider?.api_key && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                          当前中转站未配置 API Key，请先到“设置”页完成配置。
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Select
                          value={aiRuntimeProviderID || aiSettings.active_provider_id || runtimeAIProvider?.id}
                          onValueChange={setAIRuntimeProviderID}
                        >
                          <SelectTrigger className="h-8 w-[220px]">
                            <SelectValue placeholder="选择解析中转站" />
                          </SelectTrigger>
                          <SelectContent>
                            {aiProviders.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Badge>{runtimeAIProvider?.model || "-"}</Badge>
                        <Badge variant="muted">{runtimeAIProvider?.request_mode === "responses" ? "responses 文件直传" : "chat 兼容模式"}</Badge>
                        <Badge variant="muted">{runtimeAIProvider?.base_url || "-"}</Badge>
                        <Button type="button" variant="outline" size="sm" onClick={() => setView("settings")}>
                          <Palette className="mr-1 h-4 w-4" />
                          去设置
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setView("attachments")}>
                          <Paperclip className="mr-1 h-4 w-4" />
                          附件中心
                        </Button>
                      </div>

                      <Textarea
                        rows={7}
                        value={aiText}
                        placeholder="补充上下文，如：帮我抽取题材主线、核心公司、逻辑链路与风险..."
                        onChange={(e) => setAIText(e.target.value)}
                      />

                      <input
                        ref={aiFileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.txt,.md,.csv,.json,.doc,.docx,image/*"
                        className="hidden"
                        onChange={onPickAIFiles}
                      />

                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => aiFileInputRef.current?.click()}>
                          <Upload className="mr-1 h-4 w-4" />
                          选择附件
                        </Button>
                        <Button type="button" onClick={() => void onParseAI()} disabled={aiBusy}>
                          {aiBusy ? "解析中..." : "开始 AI 解析"}
                        </Button>
                      </div>

                      {aiFiles.length > 0 && (
                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                          <p className="mb-2 text-xs uppercase tracking-wider text-blue-500">已上传附件</p>
                          <div className="space-y-2">
                            {aiFiles.map((file, idx) => (
                              <div key={`${file.file_name}-${idx}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1">
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-slate-700">{file.file_name}</p>
                                  <p className="text-xs text-slate-500">
                                    {file.mime_type} · {formatBytes(file.size)}
                                  </p>
                                </div>
                                <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveAIFile(idx)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="grid gap-5 xl:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>解析结果</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {!aiSummaryPreview && <p className="text-sm text-slate-500">先输入内容并点击“开始 AI 解析”。</p>}
                        {aiSummaryPreview && (
                          <>
                            <div className="flex flex-wrap gap-2">
                              <Badge>{aiModelLabel}</Badge>
                              <Badge variant="muted">{aiProviderLabel}</Badge>
                              {aiBusy && <Badge variant="muted">解析中...</Badge>}
                            </div>
                            <div className="max-h-[380px] overflow-auto rounded-xl border border-blue-100 bg-white p-3">
                              <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{aiSummaryPreview || "-"}</pre>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>结构化 JSON（校验/入库）</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Textarea
                          rows={14}
                          value={aiStructuredJSON}
                          placeholder='{"companies":[],"themes":[],"mappings":[],"thesis":{...}}'
                          onChange={(e) => setAIStructuredJSON(e.target.value)}
                        />
                        <Input
                          value={aiAttachmentNote}
                          placeholder="附件备注（可选）"
                          onChange={(e) => setAIAttachmentNote(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" onClick={() => void onValidateAIImport()} disabled={aiValidating}>
                            {aiValidating ? "校验中..." : "结构化校验"}
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void onImportAIResult()}
                            disabled={aiImporting || (aiValidation !== null && !aiValidation.is_valid)}
                          >
                            {aiImporting ? "入库中..." : "一键入库"}
                          </Button>
                        </div>

                        {aiValidation && (
                          <div className="rounded-xl border border-blue-100 bg-white p-3 text-sm">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className={`h-4 w-4 ${aiValidation.is_valid ? "text-emerald-600" : "text-rose-600"}`} />
                              <span className={aiValidation.is_valid ? "text-emerald-700" : "text-rose-700"}>
                                {aiValidation.is_valid ? "校验通过" : "校验未通过"}
                              </span>
                              <span className="text-slate-500">预计写入 {aiValidation.estimated_writes}</span>
                            </div>
                            {aiValidation.errors.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {aiValidation.errors.map((err, idx) => (
                                  <p key={`e-${idx}`} className="text-xs text-rose-600">
                                    {err}
                                  </p>
                                ))}
                              </div>
                            )}
                            {aiValidation.warnings.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {aiValidation.warnings.map((w, idx) => (
                                  <p key={`w-${idx}`} className="text-xs text-amber-600">
                                    {w}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {aiImportResult && (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                            入库完成：公司 {aiImportResult.created_companies}、题材 {aiImportResult.created_themes}、映射 {aiImportResult.upserted_mappings}
                            、逻辑 {aiImportResult.created_theses}、附件 {aiImportResult.saved_attachments}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {view === "attachments" && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>附件中心</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
                        <Select value={attachmentScope} onValueChange={setAttachmentScope}>
                          <SelectTrigger>
                            <SelectValue placeholder="选择范围" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">全部范围</SelectItem>
                            <SelectItem value="general">general</SelectItem>
                            <SelectItem value="theme">theme</SelectItem>
                            <SelectItem value="thesis">thesis</SelectItem>
                            <SelectItem value="company_theme">company_theme</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input value={attachmentQuery} placeholder="搜索文件名/备注" onChange={(e) => setAttachmentQuery(e.target.value)} />
                        <Button type="button" variant="outline" onClick={() => void loadAttachments()} disabled={attachmentsLoading}>
                          {attachmentsLoading ? "加载中..." : "查询"}
                        </Button>
                      </div>

                      <div className="max-h-[620px] overflow-auto rounded-xl border border-blue-100">
                        <Table>
                          <TableHeader className="sticky top-0 bg-blue-50">
                            <TableRow className="hover:bg-blue-50">
                              <TableHead>文件</TableHead>
                              <TableHead>范围</TableHead>
                              <TableHead>备注</TableHead>
                              <TableHead>时间</TableHead>
                              <TableHead>操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {attachments.map((item) => (
                              <TableRow key={item.id} className="hover:bg-transparent">
                                <TableCell>
                                  <div className="font-medium text-slate-700">{item.file_name}</div>
                                  <div className="text-xs text-slate-500">
                                    {item.mime_type} · {formatBytes(item.file_size)}
                                  </div>
                                </TableCell>
                                <TableCell className="text-slate-500">
                                  {item.scope_type}
                                  {item.scope_id > 0 ? ` #${item.scope_id}` : ""}
                                </TableCell>
                                <TableCell className="text-slate-500">{item.note || "-"}</TableCell>
                                <TableCell className="text-xs text-slate-500">{item.created_at}</TableCell>
                                <TableCell>
                                  <Button type="button" size="sm" variant="outline" onClick={() => void onOpenAttachmentPreview(item.id)}>
                                    预览
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                            {!attachmentsLoading && attachments.length === 0 && (
                              <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                                  暂无附件记录
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  <ModalShell
                    open={attachmentPreviewOpen}
                    title={attachmentPreview ? `附件预览 · ${attachmentPreview.file_name}` : "附件预览"}
                    size="xl"
                    onClose={() => setAttachmentPreviewOpen(false)}
                  >
                    {!attachmentPreview && <p className="text-sm text-slate-500">加载中...</p>}
                    {attachmentPreview && (
                      <div className="space-y-3">
                        <p className="text-xs text-slate-500">{attachmentPreview.mime_type}</p>
                        {attachmentPreview.text_preview && (
                          <div className="max-h-[70vh] overflow-auto rounded-xl border border-blue-100 bg-white p-3">
                            <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{attachmentPreview.text_preview}</pre>
                          </div>
                        )}
                        {!attachmentPreview.text_preview && attachmentPreview.data_url && attachmentPreview.mime_type.startsWith("image/") && (
                          <img src={attachmentPreview.data_url} alt={attachmentPreview.file_name} className="max-h-[70vh] rounded-xl border border-blue-100" />
                        )}
                        {!attachmentPreview.text_preview && attachmentPreview.data_url && attachmentPreview.mime_type.includes("pdf") && (
                          <iframe title={attachmentPreview.file_name} src={attachmentPreview.data_url} className="h-[70vh] w-full rounded-xl border border-blue-100" />
                        )}
                        {!attachmentPreview.text_preview && !attachmentPreview.data_url && (
                          <p className="text-sm text-slate-500">该类型暂不支持内联预览。</p>
                        )}
                      </div>
                    )}
                  </ModalShell>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const marker = "base64,";
      const idx = result.indexOf(marker);
      if (idx < 0) {
        reject(new Error("invalid data url"));
        return;
      }
      resolve(result.slice(idx + marker.length));
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function ModalShell({
  open,
  title,
  size = "md",
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  size?: "md" | "lg" | "xl";
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }
  const widthClass = size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-4xl" : "max-w-2xl";
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" aria-label="关闭弹窗" className="absolute inset-0 bg-slate-900/35" onClick={onClose} />
      <div className={`relative z-[91] w-full ${widthClass} overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-blue-600">{title}</h3>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[76vh] overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ReviewBadge({ result }: { result: string }) {
  if (result === "validated") {
    return <Badge>validated</Badge>;
  }
  if (result === "partially_valid") {
    return <Badge variant="muted">partially_valid</Badge>;
  }
  return <Badge variant="muted">invalid</Badge>;
}

function NavButton({
  active,
  collapsed,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "outline" : "ghost"}
      className={`h-10 w-full rounded-lg border ${
        collapsed ? "justify-center px-0" : "justify-start"
      } ${
        active
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
      }`}
      title={label}
      onClick={onClick}
    >
      <span className={collapsed ? "" : "mr-2"}>{icon}</span>
      {!collapsed && label}
    </Button>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="bg-blue-50 shadow-none">
      <CardContent className="p-3">
        <p className="text-xs uppercase tracking-wider text-blue-500">{label}</p>
        <p className="text-xl font-semibold text-blue-700">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatSkeleton() {
  return (
    <Card className="bg-blue-50 shadow-none">
      <CardContent className="space-y-2 p-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-10" />
      </CardContent>
    </Card>
  );
}

function ThesisSkeleton() {
  return (
    <Card className="border-blue-100 shadow-none">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-14" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  );
}

function EmptyState({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">{icon}</div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{desc}</p>
    </div>
  );
}

export default App;
