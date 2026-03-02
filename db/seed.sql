-- companies
INSERT INTO companies (ts_code, company_name, industry_l1, industry_l2, listing_board)
VALUES
('300308.SZ', '中际旭创', '电子', '光模块', '创业板'),
('002463.SZ', '沪电股份', '电子', 'PCB', '主板'),
('603986.SH', '兆易创新', '电子', '半导体', '主板');

-- themes
INSERT INTO themes (theme_name, theme_type, description, lifecycle_stage, heat_score)
VALUES
('AI算力', 'concept', '围绕GPU服务器、光模块、交换机等基础设施扩容', 'growth', 86),
('国产替代', 'policy', '核心器件与软件自主可控渗透率提升', 'growth', 78);

-- company_themes
INSERT INTO company_themes (company_id, theme_id, relevance_score, role_in_chain, is_primary, evidence_summary)
VALUES
((SELECT id FROM companies WHERE ts_code='300308.SZ'), (SELECT id FROM themes WHERE theme_name='AI算力'), 95, '核心标的', 1, '800G/1.6T 光模块需求弹性大'),
((SELECT id FROM companies WHERE ts_code='002463.SZ'), (SELECT id FROM themes WHERE theme_name='AI算力'), 82, '中游', 1, '高速PCB供给受益服务器升级'),
((SELECT id FROM companies WHERE ts_code='603986.SH'), (SELECT id FROM themes WHERE theme_name='国产替代'), 76, '核心标的', 1, '存储与MCU国产化需求提升');

-- theses
INSERT INTO investment_theses (company_theme_id, thesis_version, thesis_title, thesis_body, key_metrics, expected_timeline, confidence_level, author)
VALUES
(
  (SELECT ct.id FROM company_themes ct
   JOIN companies c ON c.id = ct.company_id
   JOIN themes t ON t.id = ct.theme_id
   WHERE c.ts_code='300308.SZ' AND t.theme_name='AI算力'),
  1,
  'AI资本开支上行带动高端光模块放量',
  '海外云厂商资本开支恢复，800G渗透率提升，公司产能与客户结构匹配，业绩弹性较高。',
  '{"营收增速":"同比>30%","毛利率":"维持或提升","订单能见度":"3-4个季度"}',
  '6-18个月',
  'medium',
  'system'
),
(
  (SELECT ct.id FROM company_themes ct
   JOIN companies c ON c.id = ct.company_id
   JOIN themes t ON t.id = ct.theme_id
   WHERE c.ts_code='603986.SH' AND t.theme_name='国产替代'),
  1,
  '国产存储与MCU在工业和消费场景渗透',
  '在地缘与供应链约束下，部分下游客户提高国产芯片导入比例，公司产品线具备覆盖优势。',
  '{"新品收入占比":"持续提升","下游客户数":"季度环比增长","库存周转":"改善"}',
  '12-24个月',
  'medium',
  'system'
);

-- catalysts
INSERT INTO catalysts (company_theme_id, catalyst_type, title, event_date, impact_direction, impact_level, note)
VALUES
(
  (SELECT ct.id FROM company_themes ct
   JOIN companies c ON c.id = ct.company_id
   JOIN themes t ON t.id = ct.theme_id
   WHERE c.ts_code='300308.SZ' AND t.theme_name='AI算力'),
  '业绩',
  '季度业绩超预期',
  '2026-04-25',
  'positive',
  'high',
  '关注高端产品占比变化'
);

-- risks
INSERT INTO risks (company_theme_id, risk_type, risk_title, risk_detail, probability, severity)
VALUES
(
  (SELECT ct.id FROM company_themes ct
   JOIN companies c ON c.id = ct.company_id
   JOIN themes t ON t.id = ct.theme_id
   WHERE c.ts_code='300308.SZ' AND t.theme_name='AI算力'),
  '估值',
  '高估值回撤风险',
  '若行业景气边际走弱，高估值可能出现快速压缩。',
  'medium',
  'high'
);

-- sources
INSERT INTO sources (company_theme_id, source_type, source_title, source_url, source_date, credibility_score, note)
VALUES
(
  (SELECT ct.id FROM company_themes ct
   JOIN companies c ON c.id = ct.company_id
   JOIN themes t ON t.id = ct.theme_id
   WHERE c.ts_code='300308.SZ' AND t.theme_name='AI算力'),
  'announcement',
  '公司定期报告',
  'https://example.com/announcement',
  '2026-01-30',
  85,
  '示例链接，实际应替换为公告原文'
);

