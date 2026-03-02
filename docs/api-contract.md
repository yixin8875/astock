# API Contract (MVP)

Base URL: `/api/v1`

## 1. 公司管理

### POST `/companies`
- 用途：新增公司
- 请求体：
```json
{
  "ts_code": "300308.SZ",
  "company_name": "中际旭创",
  "industry_l1": "电子",
  "industry_l2": "光模块",
  "listing_board": "创业板"
}
```

### GET `/companies`
- 用途：公司列表（支持关键字搜索）
- 查询参数：
  - `q`：公司名/代码模糊搜索
  - `page`、`page_size`

### GET `/companies/{id}`
- 用途：公司详情（含关联题材）

## 2. 题材管理

### POST `/themes`
- 用途：新增题材
- 请求体：
```json
{
  "theme_name": "AI算力",
  "theme_type": "concept",
  "description": "围绕GPU服务器、光模块、交换机等基础设施扩容",
  "lifecycle_stage": "growth",
  "heat_score": 86
}
```

### GET `/themes`
- 用途：题材列表
- 查询参数：
  - `stage`：early/growth/mature/decline
  - `type`：concept/policy/cycle
  - `page`、`page_size`

## 3. 公司-题材关系

### POST `/company-themes`
- 用途：绑定公司与题材
- 请求体：
```json
{
  "company_id": 1,
  "theme_id": 1,
  "relevance_score": 90,
  "role_in_chain": "核心标的",
  "is_primary": true,
  "evidence_summary": "订单与产品结构都与主题高度相关"
}
```

### GET `/company-themes`
- 用途：按公司或题材筛选关系
- 查询参数：
  - `company_id`
  - `theme_id`
  - `is_primary`

## 4. 投资逻辑

### POST `/company-themes/{id}/theses`
- 用途：新增投资逻辑版本
- 请求体：
```json
{
  "thesis_title": "AI资本开支上行带动高端光模块放量",
  "thesis_body": "海外云厂商资本开支恢复，800G渗透率提升...",
  "key_metrics": {
    "营收增速": "同比>30%",
    "毛利率": "维持或提升"
  },
  "expected_timeline": "6-18个月",
  "confidence_level": "medium",
  "author": "analyst_a"
}
```

### GET `/company-themes/{id}/theses`
- 用途：查看某公司题材下所有逻辑版本

### POST `/theses/{id}/reviews`
- 用途：逻辑复盘
- 请求体：
```json
{
  "review_date": "2026-06-30",
  "review_result": "validated",
  "pnl_hint": "+18%",
  "review_note": "核心指标兑现，逻辑成立"
}
```

## 5. 催化与风险

### POST `/company-themes/{id}/catalysts`
### POST `/company-themes/{id}/risks`
### POST `/company-themes/{id}/sources`
- 用途：分别记录催化、风险、证据来源

## 6. 排序与筛选建议

- 公司维度排序：
  - `primary_theme_count DESC`
  - `avg_relevance_score DESC`
- 题材维度排序：
  - `heat_score DESC`
  - `company_count DESC`

