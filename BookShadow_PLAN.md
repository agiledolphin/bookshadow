# 书影 BookShadow — 开发方案与计划

## 一、项目概述

书影（BookShadow）是一款基于 **Tauri 2 + Rust + React** 的家庭藏书管理桌面应用，支持书籍信息管理、ISBN 元数据获取、条码批量导入、Markdown 书评编写与全文搜索。

---

## 二、技术架构

### 2.1 技术选型

| 层次 | 技术 | 说明 |
|------|------|------|
| 前端 UI | React 19 + TypeScript | 组件化 UI |
| 样式 | Tailwind CSS v4 | `@tailwindcss/vite` 插件，非 PostCSS |
| 状态管理 | Zustand | 轻量，适合桌面应用 |
| Markdown 编辑器 | CodeMirror 6 | 内置语法高亮 |
| 桌面壳 | Tauri 2 | 跨平台桌面容器 |
| 后端逻辑 | Rust | 数据库操作、ISBN 拉取、文件 IO、条码识别 |
| 数据库 | SQLite（via `rusqlite` bundled） | 本地存储 |
| HTTP 客户端 | `reqwest`（rustls-tls） | ISBN 元数据获取、封面下载 |
| 全文搜索 | SQLite FTS5 | 原生全文索引，LIKE 兜底 |
| 条码识别 | `rxing`（EAN-13） | 纯 Rust，无原生依赖 |
| 图像处理 | `image` crate | 缩略图生成（批量导入预览） |
| 构建工具 | Vite | 前端构建 |

### 2.2 目录结构

```
bookshadow/
├── src/                          # React 前端
│   ├── components/
│   │   ├── BookGrid.tsx          # 网格视图
│   │   ├── BookList.tsx          # 列表视图
│   │   ├── BookCard.tsx          # 书籍卡片
│   │   ├── BookForm.tsx          # 新增/编辑表单
│   │   ├── BookDetail.tsx        # 书籍详情页
│   │   ├── BatchImportModal.tsx  # 批量导入
│   │   ├── ReviewEditor.tsx      # Markdown 书评编辑器
│   │   ├── FilterPanel.tsx       # 筛选面板
│   │   ├── SettingsModal.tsx     # 设置
│   │   └── Toast.tsx             # 消息通知
│   ├── stores/
│   │   ├── bookStore.ts          # 书籍状态
│   │   └── toastStore.ts         # Toast 状态
│   ├── types/
│   │   └── book.ts               # 类型定义
│   └── App.tsx
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                # Tauri builder，注册所有命令
│   │   ├── db/
│   │   │   ├── mod.rs            # init_db，data_dir
│   │   │   └── schema.rs         # DDL + migration
│   │   ├── isbn/
│   │   │   ├── mod.rs            # fetch_by_isbn 级联
│   │   │   ├── douban.rs         # 豆瓣 HTML 抓取
│   │   │   ├── google_books.rs   # Google Books API
│   │   │   └── open_library.rs   # Open Library API
│   │   ├── commands/
│   │   │   ├── book.rs           # 书籍 CRUD
│   │   │   ├── review.rs         # 书评 CRUD
│   │   │   ├── search.rs         # FTS5 全文搜索
│   │   │   ├── settings.rs       # 配置读写
│   │   │   └── batch_import.rs   # 条码扫描 + 缩略图
│   │   └── config.rs             # AppConfig（google_books_api_key, douban_cookie）
│   └── tauri.conf.json
└── BookShadow_PLAN.md
```

### 2.3 数据存储

```
~/.bookshadow/
├── sqlite/bookshadow.db   # 书籍与书评数据库
├── covers/                # 封面图片本地缓存
└── config.json            # 应用配置
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
    pub_date    TEXT,
    language    TEXT,
    region      TEXT,
    category    TEXT,
    tags        TEXT,           -- JSON array
    rating      INTEGER,        -- 1-5
    cover_url   TEXT,
    cover_local TEXT,           -- 本地缓存路径
    description TEXT,
    translator  TEXT,
    status      TEXT,           -- 'want' | 'reading' | 'read'
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3.2 reviews 表

```sql
CREATE TABLE reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
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

## 四、Tauri Commands 接口

### 书籍管理

| Command | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `get_books` | `filters: BookFilters` | `Vec<Book>` | 带筛选的列表 |
| `get_book` | `id: i64` | `Book` | 单本详情 |
| `create_book` | `payload: CreateBook` | `Book` | 新增（ISBN 重复报错） |
| `update_book` | `id: i64, payload: UpdateBook` | `Book` | 更新 |
| `delete_book` | `id: i64` | `()` | 删除（含本地封面） |
| `download_cover` | `id, url, isbn` | `String` | 下载封面并更新 DB |
| `fetch_by_isbn` | `isbn, source` | `BookMeta` | ISBN 元数据级联拉取 |
| `scan_isbn_image` | `path: String` | `ScanResult` | 条码识别 + 缩略图 |
| `search_books` | `query: String` | `Vec<Book>` | FTS5 全文搜索 |

### 书评管理

| Command | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `get_reviews` | `book_id: i64` | `Vec<Review>` | 书评列表 |
| `create_review` | `payload: CreateReview` | `Review` | 新增书评 |
| `update_review` | `id, payload` | `Review` | 更新书评 |
| `delete_review` | `id: i64` | `()` | 删除书评 |
| `import_review_md` | `book_id, path` | `Review` | 从文件导入 |

### 配置

| Command | 说明 |
|---------|------|
| `get_config` | 读取 config.json |
| `save_config` | 写入 config.json |

---

## 五、ISBN 元数据获取策略

按优先级顺序依次尝试：

1. **豆瓣读书** — 中文书优先，HTML 抓取；需配置 Cookie 以绕过反爬
2. **Google Books API** — 外文书回退，支持配置 API Key
3. **Open Library API** — 开放，无需 Key

批量导入时，扫码（Phase 1）全部并行完成后，元数据抓取（Phase 2）按序执行，每条间隔 1.2 秒，避免触发频率限制。

---

## 六、开发进度

### Phase 1：项目初始化与基础架构 ✅

- [x] Tauri 2 + React + TypeScript + Vite 初始化
- [x] Tailwind CSS v4 配置
- [x] SQLite 连接与 schema 建表（books / reviews / FTS5）
- [x] 数据目录 `~/.bookshadow/` 自动创建
- [x] Zustand store 骨架

### Phase 2：书籍 CRUD ✅

- [x] Rust commands：create / get / update / delete book
- [x] BookForm 组件（新增 / 编辑，含 ISBN 自动填充）
- [x] BookGrid 网格视图（封面卡片，骨架屏加载）
- [x] BookList 列表视图
- [x] 网格 / 列表视图切换
- [x] BookDetail 详情弹层

### Phase 3：筛选与搜索 ✅

- [x] 带筛选参数的 `get_books`（状态、星级、地域、类别、语言、年代）
- [x] SQLite FTS5 + LIKE 兜底的 `search_books`
- [x] FilterPanel 筛选面板（分组，含各状态书籍数量）
- [x] 搜索框（防抖 300ms）

### Phase 4：ISBN 元数据获取 ✅

- [x] 豆瓣 HTML 抓取（处理 `\u{a0}`、作者国籍前缀解析）
- [x] Google Books API 回退
- [x] Open Library 最终回退
- [x] 封面下载缓存（`bookcover://` 自定义协议）
- [x] 豆瓣 Cookie 配置（绕过反爬）

### Phase 5：书评系统 ✅

- [x] 书评 CRUD + `.md` 文件导入
- [x] CodeMirror 6 Markdown 编辑器
- [x] 编辑 / 预览双模式切换

### Phase 6：UI 打磨 ✅

- [x] Toast 错误通知
- [x] 窗口尺寸与位置记忆（tauri-plugin-window-state）
- [x] macOS 无标题栏（titleBarStyle: Overlay）+ 自定义拖拽区域
- [x] macOS「关于」对话框自定义（名称、版本、版权、图标）
- [x] 书籍浏览区独立滚动（工具栏固定）

### Phase 7：批量导入 ✅（v0.3.0）

- [x] 图片条码识别（rxing EAN-13，含 ISBN-13 校验位验证）
- [x] 批量扫码并行，元数据抓取串行（间隔 1.2s）
- [x] 缩略图生成（Rust image crate，base64 内嵌）
- [x] 扫码失败 → 手动输入 ISBN
- [x] 重复书籍检测并提示跳过
- [x] 导入进度实时显示，封面异步下载

---

## 七、关键设计决策

| 决策 | 原因 |
|------|------|
| `SELECT_COLS` 常量 + `row_to_book` 按索引映射 | 避免字段顺序不一致导致的 bug |
| `bookcover://` 自定义协议 | 安全地服务本地封面，防路径穿越 |
| `data-tauri-drag-region` 需显式声明 `core:window:allow-start-dragging` | 不在 `core:default` 中，需手动加入 capabilities |
| 豆瓣 Cookie 存 config.json | 避免硬编码，用户可自行更新过期 Cookie |
| 批量导入扫码并行 + 抓取串行 | 扫码是本地 CPU 任务可并行；网络请求串行避免触发豆瓣频率限制 |

---

## 八、后续可扩展方向

- 数据导出（CSV / JSON）
- iCloud / 本地 NAS 同步
- 阅读进度追踪
- 借阅记录
- WebView 方案绕过豆瓣反爬（更彻底，无需手动维护 Cookie）
