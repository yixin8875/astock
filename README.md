# A股题材库桌面端

技术栈：`Wails + React + SQLite + TailwindCSS`

## 功能范围（MVP）

- 公司管理：新增公司、查看公司列表
- 题材管理：新增题材、查看题材列表
- 公司题材映射：维护关联关系、相关性、主线标记、证据摘要
- 投资逻辑：按“公司题材关系”新增逻辑版本并查看历史
- AI解析：支持文字 + 图片 + PDF 附件多模态解析，支持结构化校验与一键入库
- 附件中心：统一归档附件并按范围检索、预览原文
- 设置中心：统一配置 AI 模型参数、解析默认参数与主题色
- 启动自动建库：首次启动自动执行 `db/schema.sql` 与 `db/seed.sql`

## 目录

- `app.go` / `store.go` / `models.go`：Go 后端与 SQLite 访问层
- `db/schema.sql`：表结构
- `db/seed.sql`：种子数据
- `frontend/src/App.tsx`：前端主界面
- `frontend/src/style.css`：Tailwind 入口与全局样式
- `docs/api-contract.md`：接口契约（与后端方法对应）
- `docs/field-guide.md`：字段填写规范

## 开发运行

1. 安装前端依赖
```bash
cd frontend
npm install
cd ..
```

2. 启动开发模式
```bash
wails dev
```

## 构建

- 构建可执行文件（不打包 app bundle）：
```bash
wails build -nopackage -m
```

产物：`build/bin/astock`

说明：当前环境下 `wails build` 打包阶段可能失败，但 `-nopackage` 构建可执行文件已验证通过。
