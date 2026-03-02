PRAGMA foreign_keys = ON;

-- 公司主表
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_code TEXT NOT NULL UNIQUE,          -- 证券代码，如 300308.SZ
  company_name TEXT NOT NULL,            -- 公司简称
  industry_l1 TEXT,                      -- 一级行业
  industry_l2 TEXT,                      -- 二级行业
  listing_board TEXT,                    -- 主板/创业板/科创板等
  status TEXT NOT NULL DEFAULT 'active', -- active/inactive
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(company_name);

-- 题材主表
CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_name TEXT NOT NULL UNIQUE,            -- 题材名，如 算力租赁
  theme_type TEXT NOT NULL DEFAULT 'concept', -- concept/policy/cycle
  description TEXT,                           -- 题材定义
  lifecycle_stage TEXT,                       -- early/growth/mature/decline
  heat_score INTEGER NOT NULL DEFAULT 50,     -- 0-100
  is_pinned_main INTEGER NOT NULL DEFAULT 0,  -- 是否手动置顶主线题材
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_themes_name ON themes(theme_name);
CREATE INDEX IF NOT EXISTS idx_themes_stage ON themes(lifecycle_stage);

-- 题材关键字段变更记录（热度/阶段/主线置顶）
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
);

CREATE INDEX IF NOT EXISTS idx_theme_change_logs_theme ON theme_change_logs(theme_id, created_at DESC);

-- 公司-题材映射（多对多）
CREATE TABLE IF NOT EXISTS company_themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  theme_id INTEGER NOT NULL,
  relevance_score INTEGER NOT NULL DEFAULT 50, -- 0-100, 相关性
  role_in_chain TEXT,                          -- 核心标的/上游/中游/下游/边缘受益
  is_primary INTEGER NOT NULL DEFAULT 0,       -- 是否主线题材
  evidence_summary TEXT,                       -- 归因证据简述
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_id, theme_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(theme_id) REFERENCES themes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_company_themes_company ON company_themes(company_id);
CREATE INDEX IF NOT EXISTS idx_company_themes_theme ON company_themes(theme_id);

-- 投资逻辑版本表（可追溯）
CREATE TABLE IF NOT EXISTS investment_theses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_theme_id INTEGER NOT NULL,
  thesis_version INTEGER NOT NULL DEFAULT 1,
  thesis_title TEXT NOT NULL,                  -- 逻辑标题
  thesis_body TEXT NOT NULL,                   -- 逻辑正文
  key_metrics TEXT,                            -- 核心验证指标（JSON 字符串）
  expected_timeline TEXT,                      -- 预期兑现周期
  confidence_level TEXT,                       -- high/medium/low
  status TEXT NOT NULL DEFAULT 'active',       -- active/invalidated/archived
  author TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(company_theme_id) REFERENCES company_themes(id) ON DELETE CASCADE,
  UNIQUE(company_theme_id, thesis_version)
);

CREATE INDEX IF NOT EXISTS idx_theses_company_theme ON investment_theses(company_theme_id);
CREATE INDEX IF NOT EXISTS idx_theses_status ON investment_theses(status);

-- 催化事件表
CREATE TABLE IF NOT EXISTS catalysts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_theme_id INTEGER NOT NULL,
  catalyst_type TEXT,                        -- 政策/订单/业绩/产品发布/行业景气
  title TEXT NOT NULL,
  event_date TEXT,                           -- 计划或发生日期
  impact_direction TEXT NOT NULL DEFAULT 'positive', -- positive/negative
  impact_level TEXT NOT NULL DEFAULT 'medium',       -- high/medium/low
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(company_theme_id) REFERENCES company_themes(id) ON DELETE CASCADE
);

-- 风险点表
CREATE TABLE IF NOT EXISTS risks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_theme_id INTEGER NOT NULL,
  risk_type TEXT,                    -- 估值/政策/竞争/技术/执行/资金
  risk_title TEXT NOT NULL,
  risk_detail TEXT,
  probability TEXT,                  -- high/medium/low
  severity TEXT,                     -- high/medium/low
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(company_theme_id) REFERENCES company_themes(id) ON DELETE CASCADE
);

-- 证据来源表（研报、公告、访谈等）
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_theme_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,         -- announcement/report/news/meeting
  source_title TEXT NOT NULL,
  source_url TEXT,
  source_date TEXT,
  credibility_score INTEGER NOT NULL DEFAULT 50, -- 0-100
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(company_theme_id) REFERENCES company_themes(id) ON DELETE CASCADE
);

-- 逻辑验证记录（复盘）
CREATE TABLE IF NOT EXISTS thesis_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thesis_id INTEGER NOT NULL,
  review_date TEXT NOT NULL,
  review_result TEXT NOT NULL,         -- validated/partially_valid/invalid
  pnl_hint TEXT,                       -- 可选：区间收益提示
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(thesis_id) REFERENCES investment_theses(id) ON DELETE CASCADE
);

-- 应用配置（AI模型参数等）
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 附件中心（归档图片/PDF/文本等）
CREATE TABLE IF NOT EXISTS ai_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL DEFAULT 'general', -- general/theme/thesis/company_theme
  scope_id INTEGER NOT NULL DEFAULT 0,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  file_data BLOB NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_attachments_scope ON ai_attachments(scope_type, scope_id, created_at DESC);
