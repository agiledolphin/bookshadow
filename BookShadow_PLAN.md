# 书影 BookShadow — 开发方案与计划

## 一、项目概述

书影（BookShadow）是一款基于 **Tauri + Rust + React** 的家庭藏书管理桌面应用，支持书籍信息管理、ISBN 元数据获取、Markdown 书评编写与全文搜索。

---

## 二、技术架构

### 2.1 技术选型

| 层次 | 技术 | 说明 |
|------|------|------|
| 前端 UI | React 18 + TypeScript | 组件化 UI |
| UI 组件库 | shadcn/ui + Tailwind CSS | 样式系统 |
| 状态管理 | Zustand | 轻量，适合桌面应用 |
| Markdown 编辑器 | CodeMirror 6 | 内置语法高亮 |
| 桌面壳 | Tauri 2 | 跨平台桌面容器 |
| 后端逻辑 | Rust | 数据库操作、ISBN 拉取、文件 IO |
| 数据库 | SQLite（via `rusqlite`） | 本地存储 |
| HTTP 客户端 | `reqwest`（Rust） | ISBN 元数据获取 |
| 全文搜索 | SQLite FTS5 | 原生全文索引 |
| 构建工具 | Vite | 前端构建 |

### 2.2 目录结构

```
bookshadow/
├── src/                        # React 前端
│   ├── components/
│   │   ├── BookGrid.tsx        # 网格视图
│   │   ├── BookList.tsx        # 列表视图
│   │   ├── BookForm.tsx        # 新增/编辑表单
│   │   ├── BookDetail.tsx      # 书籍详情页
│   │   ├── ReviewEditor.tsx    # Markdown 书评编辑器
│   │   ├── FilterPanel.tsx     # 筛选面板
│   │   └── SearchBar.tsx       # 搜索框
│   ├── stores/
│   │   ├── bookStore.ts        # 书籍状态
│   │   └── uiStore.ts          # UI 状态（视图模式等）
│   ├── hooks/
│   │   └── useBooks.ts         # 书籍 CRUD hooks
│   ├── types/
│   │   └── book.ts             # 类型定义
│   └── App.tsx
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── schema.rs       # 建表 SQL
│   │   │   └── queries.rs      # CRUD 查询
│   │   ├── isbn/
│   │   │   ├── mod.rs
│   │   │   ├── douban.rs       # 豆瓣 API
│   │   │   ├── google_books.rs # Google Books API
│   │   │   └── open_library.rs # Open Library API
│   │   └── commands/
│   │       ├── book.rs         # book CRUD commands
│   │       ├── review.rs       # review commands
│   │       └── search.rs       # 搜索 commands
│   └── tauri.conf.json
└── BookShadow_PLAN.md
```

### 2.3 数据存储

```
~/.bookshadow/
├── sqlite/
│   └── bookshadow.db           # SQLite 主数据库
└── covers/                     # 封面图片缓存
```

---

## 三、数据库设计

### 3.1 books 表

```sql
CREATE TABLE books (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    author      TEXT,
    isbn        TEXT UNIQUE,
    publisher   TEXT,
    pub_year    INTEGER,
    language    TEXT,           -- 'zh', 'en', 'ja', etc.
    region      TEXT,           -- 'CN', 'JP', 'US', etc.
    category    TEXT,           -- '小说', '历史', etc.
    tags        TEXT,           -- JSON array
    rating      INTEGER,        -- 1-5
    cover_url   TEXT,
    cover_local TEXT,           -- 本地缓存路径
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.2 reviews 表

```sql
CREATE TABLE reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,  -- Markdown 正文
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.3 全文搜索索引（FTS5）

```sql
CREATE VIRTUAL TABLE books_fts USING fts5(
    title, author, description, tags,
    content='books', content_rowid='id'
);
```

---

## 四、Tauri Commands 接口设计

### 书籍管理

| Command | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `get_books` | `filters: BookFilters` | `Vec<Book>` | 带筛选的列表 |
| `get_book` | `id: i64` | `Book` | 单本详情 |
| `create_book` | `payload: CreateBook` | `Book` | 新增 |
| `update_book` | `id: i64, payload: UpdateBook` | `Book` | 更新 |
| `delete_book` | `id: i64` | `()` | 删除 |
| `fetch_by_isbn` | `isbn: String` | `BookMeta` | ISBN 拉取元数据 |
| `search_books` | `query: String` | `Vec<Book>` | 全文搜索 |

### 书评管理

| Command | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `get_reviews` | `book_id: i64` | `Vec<Review>` | 书评列表 |
| `create_review` | `payload: CreateReview` | `Review` | 新增书评 |
| `update_review` | `id: i64, payload: UpdateReview` | `Review` | 更新书评 |
| `delete_review` | `id: i64` | `()` | 删除书评 |
| `import_review_md` | `book_id: i64, path: String` | `Review` | 从文件导入 |

---

## 五、ISBN 元数据获取策略

按优先级顺序依次尝试：

1. **豆瓣读书**（中文书优先，非官方 API，有频率限制）
2. **Google Books API**（需网络，无需 key，有配额）
3. **Open Library API**（开放，无需 key）

获取字段：书名、作者、出版社、出版年、封面图、简介、语言。

---

## 六、前端页面设计

### 6.1 主界面布局

```
┌─────────────────────────────────────────────────────┐
│  [搜索框]          [网格/列表切换]   [+ 新增]        │  ← 顶部工具栏
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│  筛选面板 │  书籍视图（网格 or 列表）                  │
│  - 星级   │                                          │
│  - 地域   │                                          │
│  - 类别   │                                          │
│  - 语言   │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

### 6.2 书籍详情 / 编辑页

- 左侧：封面 + 基本信息（ISBN、作者、出版社、年份、星级、地域、类别、语言、标签）
- 右侧：书评列表 + Markdown 编辑器

### 6.3 新增书籍流程

1. 输入 ISBN → 自动拉取元数据 → 填充表单
2. 或手动填写所有字段
3. 保存

---

## 七、开发阶段计划

### Phase 1：项目初始化与基础架构 ✅ 已完成

- [x] `create-tauri-app` 初始化项目（React + TypeScript + Vite）
- [x] 配置 Tailwind CSS v4
- [x] Rust 端：初始化 SQLite 连接，实现 schema 建表（books / reviews / FTS5 触发器）
- [x] 实现数据存储目录 `~/.bookshadow/sqlite/` 与 `covers/` 自动创建
- [x] 搭建 Zustand store 骨架

### Phase 2：书籍 CRUD ✅ 已完成（待端到端测试）

- [x] Rust commands：`create_book`, `get_books`, `get_book`, `update_book`, `delete_book`
- [x] 前端：BookForm 组件（新增 / 编辑，含 ISBN 自动填充入口）
- [x] 前端：BookGrid 组件（封面卡片，封面 URL 展示）
- [x] 前端：BookList 组件（行列表）
- [x] 前端：网格 / 列表视图切换
- [x] 前端：BookDetail 详情弹层

### Phase 3：筛选与搜索 ✅ 已完成（待端到端测试）

- [x] Rust：带筛选参数的 `get_books`（星级、地域、类别、语言）
- [x] Rust：SQLite FTS5 索引 + `search_books` command（兼 LIKE 兜底）
- [x] 前端：FilterPanel 筛选面板（分组卡片样式）
- [x] 前端：SearchBar 搜索框（防抖 300ms，集成在工具栏）
- [x] 前端：筛选与搜索状态联动

### Phase 4：ISBN 元数据获取 🔶 部分完成

- [x] Rust：`fetch_by_isbn` command，依次尝试 Google Books → Open Library
- [x] 前端：ISBN 输入框 + 一键拉取 + loading / 错误状态
- [ ] **封面图片下载并缓存到 `~/.bookshadow/covers/`**（Rust 端实现，前端优先读本地）

### Phase 5：书评系统 🔶 部分完成

- [x] Rust commands：书评 CRUD + `import_review_md`
- [x] 前端：CodeMirror 6 Markdown 编辑器集成
- [x] 前端：书评列表，显示书评日期
- [x] 前端：从 `.md` 文件导入书评
- [ ] **ReviewEditor 编辑 / 预览双模式切换**（当前仅编辑模式，无渲染预览）

### Phase 6：打磨与发布 ⬜ 待开发

- [ ] Toast 错误通知（替代 console.error / alert）
- [ ] 窗口尺寸与位置记忆（写入 `~/.bookshadow/config.json`）
- [ ] 封面图片占位图优化（加载中骨架屏）
- [ ] macOS 打包测试（`npm run tauri build`）
- [ ] README 用户文档

---

## 八、关键风险与应对

| 风险 | 应对 |
|------|------|
| 豆瓣 API 不稳定 / 被封 | 降级到 Google Books，不强依赖豆瓣 |
| FTS5 中文分词效果差 | 结合 LIKE 模糊搜索兜底 |
| 封面图片版权 | 仅本地缓存，不对外分发 |
| Tauri 2 生态尚不成熟 | 锁定版本，避免频繁升级 |

---

## 九、后续可扩展方向（超出当前范围）

- 数据导出（CSV / JSON / 豆瓣格式）
- iCloud / 本地 NAS 同步
- 阅读进度追踪
- 借阅记录
- 更多 ISBN 数据源（豆瓣 v2、开卷数据）
