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
│   │   ├── BookForm.tsx          # 新增表单（仅新增）
│   │   ├── BookDetail.tsx        # 书籍详情页（含内联编辑）
│   │   ├── BatchImportModal.tsx  # 批量导入（拖拽或选择图片）
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
│   │   │   ├── douban.rs         # 豆瓣 HTML 抓取（支持 ISBN 和 subject URL）
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
| `upload_cover` | `id, src_path` | `String` | 从本地文件复制封面并更新 DB |
| `fetch_by_isbn` | `isbn, source` | `BookMeta` | ISBN 或豆瓣链接元数据获取 |
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

1. **豆瓣读书** — 中文书优先，HTML 抓取；支持 ISBN 和 `book.douban.com/subject/` 直链两种输入；需配置 Cookie 以绕过反爬
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
- [x] BookForm 组件（新增，含 ISBN 自动填充）
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

### Phase 8：体验优化 ✅（v0.4.1）

- [x] 批量导入：先打开面板，支持拖拽图片或点击选择（移除自动弹出文件对话框）
- [x] BookDetail 内联编辑：查看与编辑在同一面板切换，ESC 退出编辑模式，保存后返回浏览界面
- [x] ISBN 输入支持豆瓣 subject 直链，解决同一 ISBN 多条豆瓣记录问题
- [x] 豆瓣作者国籍解析兼容全角方括号 `［国籍］`
- [x] 新增类别：散文、诗歌
- [x] 新增地域：秘鲁

### Phase 9：标签、导航与导出 ✅（v0.5.0）

- [x] 标签系统：书籍支持多标签，pill 式输入（Enter / 逗号添加，Backspace 删除），编辑时智能补全已有标签
- [x] 按标签筛选：FilterPanel 底部动态显示全部标签，点击即筛选
- [x] 分页加载：`get_books` / `search_books` 支持 limit/offset，滚动到底部自动加载（每页 40 条）
- [x] 键盘快捷键：`/` 聚焦搜索框；`e`/`E` 进入编辑模式；`←`/`→` 在当前列表内切换书籍
- [x] BookDetail 导航按钮：header 显示 ‹ › 箭头，浏览模式可见，编辑模式隐藏
- [x] 数据导出：设置页新增「数据导出」分区，支持导出 JSON（全字段）和 CSV

### Phase 10：体验细节打磨 ✅（v0.5.1 / v0.5.2）

- [x] 书籍排序：工具栏排序下拉，支持加入时间↓↑、书名、出版年份新→旧/旧→新、评分高→低
- [x] 筛选联动计数：FilterPanel 各维度数字根据当前已选条件动态更新，避免点击后无结果的歧义
- [x] 搜索框交互：`/` 聚焦时全选已有内容；ESC 清空搜索
- [x] 豆瓣国籍解析：新增 `【国籍】` 黑角括号支持；兼容开闭括号混用（如 `[ 日］`）
- [x] 新增类别：语言、政治、市场
- [x] 新增地域：尼日利亚、缅甸
- [x] Vite 构建拆分 CodeMirror chunk，消除大包警告

### Phase 11：构建优化 ✅（v0.5.3）

- [x] Universal Binary 打包：`npm run tauri:build` 同时编译 `aarch64` + `x86_64`，产物可在 Apple Silicon 和 Intel Mac 原生运行

### Phase 12：封面与数据完善 ✅（v0.5.4）

- [x] 封面上传：编辑模式下支持从本地文件选择封面图片（jpg / png / webp），命名规范与豆瓣下载一致（`<id>_<isbn>.<ext>` 或 `<id>.<ext>`）
- [x] 封面刷新修复：`bookcover://` 协议响应加 `Cache-Control: no-store`；store 维护 `coverNonce`，封面更新后 URL 含版本参数，确保 WebKit 不读旧缓存
- [x] 封面覆盖策略：从豆瓣/Google Books/Open Library 重新获取封面时，无论是否已有本地封面均覆盖；手动上传后清空 `cover_url`，防止被自动重新下载覆盖
- [x] 类别筛选分层：FilterPanel 类别区同地域一样，固定显示 8 个主要类别，其余折叠到「其他」
- [x] 新增类别：音乐、生活、数学、物理
- [x] 新增地域：智利

### Phase 13：体验与数据修复 ✅（v0.5.5）

- [x] 批量导入后左侧筛选栏未刷新：导入完成后同时调用 `refreshAllBooks()`，`allBooks` 更新后筛选计数即时联动
- [x] 新增地域：希腊（含豆瓣国籍映射 `"希" | "希腊" => "希腊"`）
- [x] 新增类别：设计（位于「艺术」之后，归入筛选栏「其他」折叠区）
- [x] 可搜索下拉 `SearchableSelect` 组件：替换 BookForm 与 BookDetail 编辑模式中的地域、类别原生 `<select>`；输入过滤、键盘导航、当前选中项高亮，语言字段选项少保持原 select
- [x] ISBN 合法性校验：`sanitize_isbn` 函数只接受纯数字/连字符/X（ISBN-10 校验位）；`create_book` / `update_book` 入口清洗，豆瓣 URL 等非法值存 NULL；`download_cover` / `upload_cover` 文件名生成同步修复，彻底消除含斜杠路径导致的"No such file or directory"
- [x] 前端 ISBN 回填修复：BookForm / BookDetail 通过豆瓣链接抓取后，若 `meta.isbn` 为空不再将原始 URL 回填到 isbn 字段
- [x] 数据库一次性清理：将现有 isbn 字段中存储为豆瓣 URL 的记录置 NULL

### Phase 14：搜索与筛选统一 ✅（v0.5.6）

- [x] 搜索与筛选合并：`search_query` 并入 `BookFilters`，`get_books` 统一处理文字搜索（title/author/translator/description/tags LIKE）与侧边栏筛选（AND 组合）；删除独立的 `search_books` 命令调用路径
- [x] 「全部」按钮行为优化：仅反映侧边栏筛选状态，有搜索词时保持高亮；点击只清侧边栏条件，不清搜索框
- [x] 年代筛选加数量：筛选面板年代区显示各年代书籍数量，与状态/地域等维度保持一致
- [x] 全局重置快捷入口：点击侧边栏「书影」logo 或按 `Escape`（无弹窗/详情面板/输入框聚焦时）可一键清空所有筛选与搜索词，回到全部图书浏览状态

---

## 七、关键设计决策

| 决策 | 原因 |
|------|------|
| `SELECT_COLS` 常量 + `row_to_book` 按索引映射 | 避免字段顺序不一致导致的 bug |
| `bookcover://` 自定义协议 | 安全地服务本地封面，防路径穿越 |
| `data-tauri-drag-region` 需显式声明 `core:window:allow-start-dragging` | 不在 `core:default` 中，需手动加入 capabilities |
| 豆瓣 Cookie 存 config.json | 避免硬编码，用户可自行更新过期 Cookie |
| 批量导入扫码并行 + 抓取串行 | 扫码是本地 CPU 任务可并行；网络请求串行避免触发豆瓣频率限制 |
| 豆瓣支持 subject URL 直链 | `/isbn/` 端点存在同 ISBN 多条记录时只返回一条，直链可精确指定版本 |
| BookDetail 内联编辑 | 减少弹层嵌套，编辑时封面可见，书评区始终可访问 |
| `extract_nationality_prefix` 兼容多种括号 | 豆瓣页面混用 ASCII `[`、全角 `［`、黑角 `【` 及开闭混搭，统一搜索任意闭括号 |
| 筛选联动计数 | 每个维度的数字排除自身过滤条件，对其余条件过滤后统计，消除"点击后无结果"歧义 |
| Vite `manualChunks` 拆分 CodeMirror | CodeMirror 固有体积约 600 KB，单独拆出避免主 chunk 超限警告 |
| `npm run tauri:build` 固定 `--target universal-apple-darwin` | 统一打包命令，产物同时支持 Apple Silicon 和 Intel，无需维护两套安装包 |
| `bookcover://` 响应加 `Cache-Control: no-store` + `coverNonce` | WebKit 会缓存自定义协议响应；同文件名覆盖后需 URL 变化才能触发重新拉取 |
| 手动上传封面后清空 `cover_url` | 防止下次编辑保存时自动重新下载远程封面，覆盖用户手动上传的图片 |
| `sanitize_isbn` 校验 ISBN 格式 | isbn 字段存入豆瓣 URL 时，`upload_cover` / `download_cover` 拼出含 `/` 的非法路径，导致"No such file or directory"；在保存层统一清洗，从源头防止脏数据入库 |
| `SearchableSelect` 替换地域/类别下拉 | 地域 40+ 项、类别 26 项，原生 select 滚动体验差；可搜索下拉输入 1-2 字即可过滤，与标签输入体验一致，组件在 BookForm / BookDetail 复用 |
| 批量导入后调用 `refreshAllBooks` | `fetchBooks` 只更新分页列表 `books`，筛选面板依赖 `allBooks`；导入后需额外刷新 `allBooks` 才能更新筛选计数 |

---

## 八、后续可扩展方向

- iCloud / 本地 NAS 同步
- 阅读进度追踪
- 借阅记录
- WebView 方案绕过豆瓣反爬（更彻底，无需手动维护 Cookie）
