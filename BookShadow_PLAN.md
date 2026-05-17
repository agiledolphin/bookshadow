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
│   │   ├── AiSuggestionPanel.tsx # AI 元数据建议面板（逐项确认）
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
│   │   │   ├── batch_import.rs   # 条码扫描 + 缩略图
│   │   │   └── llm.rs            # AI 推荐 + 元数据建议
│   │   ├── llm/
│   │   │   └── mod.rs            # call_claude + JSON 提取工具函数
│   │   └── config.rs             # AppConfig（含 anthropic_api_key / llm_base_url / llm_model）
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

### LLM / AI

| Command | 参数 | 返回 | 说明 |
|---------|------|------|------|
| `recommend_books` | — | `Vec<BookRecommendation>` | 基于高分藏书偏好对「想读」书单排序，含评分（0.1 精度）与推荐理由 |
| `suggest_metadata` | `title, author, description` | `MetadataSuggestion` | 推断书籍类别/地域/标签，结果在前端校验后展示供逐项确认 |

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

### Phase 15：筛选计数后端化与体验修复 ✅（v0.5.7）

- [x] 筛选计数后端化：新增 `get_filter_counts` Rust 命令，各维度用 SQL `GROUP BY` 聚合计算（星级返回累积值，标签用 Rust 侧解析 JSON 数组），搜索词始终参与计数，每个维度排除自身过滤条件；删除 `allBooks` / `refreshAllBooks`，FilterPanel 直接使用后端返回数据，联动计数现在反映搜索词
- [x] 标签补全数据源修复：BookDetail / BookForm 的标签补全改用 `filterCounts.tag`（全库聚合），覆盖面从分页的 40 条扩展到全库；`updateBook` 保存后刷新 `filterCounts`，新增标签即时出现在补全列表
- [x] `/` 快捷键修复：焦点在排序下拉框（`<select>`）时按 `/` 无法聚焦搜索框，已从排除列表中移除 `SELECT`（`/` 在 select 内无实际作用）

### Phase 16：数据质量完善 ✅（v0.6.0）

**目标**：补全阅读时序与丛书字段，为后续读书分析与书籍推荐提供数据基础。

**新增字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| `started_at` | TEXT nullable | 开始阅读日期（YYYY-MM-DD）；手动填写，可随时修改 |
| `finished_at` | TEXT nullable | 完成阅读日期（YYYY-MM-DD）；手动填写，可随时修改 |
| `series` | TEXT nullable | 丛书/系列名；豆瓣 `#info` 中「丛书」字段自动解析 |

**实施要点**

- [x] Schema 简化：尚无正式发布版本，`db/schema.rs` 直接在 `CREATE TABLE IF NOT EXISTS` 中包含全部列，无需版本号追踪或 `ALTER TABLE` 迁移
- [x] 同步移除 `page_count`、`original_title`、`douban_id`（价值有限，清理冗余）
- [x] `SELECT_COLS` 末尾追加 3 列（索引 18-20），`row_to_book` 同步更新；`Book` / `CreateBook` / `UpdateBook` 新增对应字段
- [x] `update_book` 对 `started_at`/`finished_at` 始终写库（`nullif(?n,'')` 空字符串转 NULL），避免 `push_field!` 宏跳过 `None` 导致无法清空
- [x] `isbn/douban.rs` 从 `parse_info()` 结果取「丛书」字段，填入 `BookMeta.series`；`BookMeta` 同步新增 `series` 字段
- [x] 状态-日期联动状态机：「想读」清空两个日期；切「在读」设 `started_at=今日`（若为空）并清 `finished_at`；切「已读」设 `finished_at=今日`（若为空）；取消对应状态则清对应日期
- [x] `DateInput` 组件：`type="text"` 显示（placeholder `YYYY-MM-DD`）+ 透明 `type="date"` 叠层仅覆盖日历图标区域，避免 WebKit 空值时显示灰色今日
- [x] UI 调整：星级评分移至封面下方；编辑行布局改为「阅读状态 | 开始阅读 | 完成阅读」三列；编辑模式隐藏书评区
- [x] 「待完善」提示：`region`、`category`、`language` 三字段任一为空时，编辑按钮旁显示轻提示
- [x] FTS5 全文索引移除：中文两字词（鲁迅、余华等）在 trigram 分词下无法命中（最少需 3 字），对小型个人库无性能优势；改用 `LIKE` 全覆盖，同步删除 `search.rs` 死代码及 FTS5 触发器/虚拟表
- [x] 搜索扩展：`LIKE` 条件新增 `publisher`、`series` 两列，覆盖出版社和丛书名搜索
- [x] 「未设」状态过滤：`""` 为哨兵值，后端映射 `status IS NULL`；`get_filter_counts` 额外统计 `NULL` 数量写入 `status[""]`，FilterPanel 当计数 > 0 时展示「未设」选项
- [x] `updateBook` 保存后调用 `fetchBooks(true)` 刷新当前过滤结果，避免在过滤状态下编辑书籍后列表不更新

### Phase 17：读书分析看板 ✅（v0.7.0）

**目标**：基于 `finished_at` 的年度阅读趋势及全库类别、地域分布可视化。

**实施要点**

- [x] `get_stats` Rust 命令：`StatusCounts`（总/已读/在读/想读/未设）、`YearCount`（按 `finished_at` 年份 GROUP BY）、`LabelCount`（类别/地域 GROUP BY，只统计有值的行）
- [x] `stats` 模块注册到 `lib.rs` invoke handler
- [x] Zustand：`stats: ReadingStats | null`；`setViewMode("stats")` 时自动调用 `fetchStats`
- [x] `StatsPanel` 组件：KPI 卡片（总藏书/已读/在读/想读/未设）+ Tab（阅读趋势 / 类别分布 / 地域分布）
- [x] `TrendChart`（SVG）：真实时间轴（x 正比于年份）；5 年网格线作背景参考；仅绘制有数据年份的柱；hover 高亮柱体，底部显示蓝色年份文字；水平滚动 + 居中布局（`display:table; margin:0 auto`）
- [x] `HorizontalBarChart`：标签（w-16）+ 进度条（flex-1）+ 数量（w-6）+ 占比%（w-8）；「未设」灰色排末尾
- [x] 工具栏重构：四组分隔设计 `[搜索/排序/⊞|≡] │ [📊] │ [↑][+] │ [⚙]`；统计看板从视图切换组独立出来，语义清晰
- [x] 统计模式下工具栏位置不变（始终渲染 w-36 占位块，切 stats 时只移除 border-r）；聚焦搜索框自动切回网格视图
- [x] `get_filter_counts` `str_group` 改用 `COALESCE(NULLIF(col,''),'')` 同时纳入 NULL 和空字符串；region/category 空字符串过滤映射 `IS NULL OR = ''`，同步修复 `book.rs` 主查询；地域/类别「未设」归入「其他」折叠区末尾显示
- [x] `push_field!` 宏改用 `NULLIF(?,'')`，编辑保存时空字符串自动转 NULL，从源头杜绝脏数据入库；存量空字符串一次性清理为 NULL
- [x] Google Books `map_category` 重写：原"科技"桶不在 CATEGORIES 中，拆分为"计算机"、"数学"、"物理"、"医学"、"自然科学"、"科普"；`psychology` → "心理"，`political` → "政治"，`marketing` → "市场"，`music/design/architect` 各自独立；新增"漫画"、"生活"、"军事"、"语言"、"宗教"映射
- [x] 豆瓣 Cookie 失效检测：`douban::fetch` 检查最终跳转 URL 是否含 `accounts.douban.com` / `/login`，并二次校验 HTML 内容；有 Cookie 时失效直接返回 `Err`；自动级联模式下 Cookie 失效错误上抛，不 fall-through 到 Google Books
- [x] 新增类别：军事、宗教；新增地域：巴基斯坦、白俄罗斯；`nationality_to_region` 同步扩充
- [x] 豆瓣登录窗口（macOS）：设置页新增「打开豆瓣登录窗口（自动提取）」按钮；在 WebView 内完成登录后，通过 macOS 原生 `WKHTTPCookieStore.getAllCookies`（`objc2-web-kit` 绑定）从 WKWebView 内部读取 `douban.com` Cookie，自动写入 `config.json` 并关闭窗口；绕过 CSP 对 `fetch` 的限制，无需用户手动从 DevTools 复制 Cookie

### Phase 18：LLM 集成 ✅（v0.8.0）

**目标**：基于用户藏书偏好的「想读」列表 AI 推荐排序，以及书籍元数据（类别/地域/标签）AI 辅助补全。

**实施要点**

- [x] `AppConfig` 新增 `anthropic_api_key`、`llm_base_url`（兼容 OpenAI 格式，默认官方 Anthropic 端点）、`llm_model`（默认 `claude-sonnet-4-6`）
- [x] `llm/mod.rs`：`call_claude(prompt, cfg)` 发送 Messages API 请求（`x-api-key` + `anthropic-version: 2023-06-01`）；`extract_json_array` / `extract_json_object` 从 LLM 输出中剥离 Markdown 代码块
- [x] `commands/llm.rs`：
  - `recommend_books` — 查询高分藏书（4-5 星，最多 50 本）完整列表 + 类别/地域/标签分布统计，构建 prompt，调用 LLM，返回带评分（0.1 精度）和推荐理由的 `Vec<BookRecommendation>`，按评分降序排列
  - `suggest_metadata` — 根据书名/作者/简介在固定 CATEGORIES / REGIONS 范围内推断类别/地域/标签，返回 `MetadataSuggestion`
- [x] 前端 store：`recommendations: Record<number, BookRecommendation> | null`；`want` 筛选切走时自动清除推荐状态
- [x] 工具栏：想读视图下显示「AI 推荐」按钮（紫色激活态），点击切换推荐排序
- [x] BookCard：推荐分数徽标（`✦ 9.2`，紫色 pill）显示在封面左上角；推荐理由作为封面渐变遮罩叠层（`bg-gradient-to-t from-black/75`）显示在封面下沿
- [x] 设置页：Anthropic API Key（密码输入 + 显示切换）、自定义 API 地址（兼容 DeepSeek / Ollama 等 OpenAI 格式端点）、模型名称
- [x] `AiSuggestionPanel` 组件：点击「AI 建议」后在按钮下方展开建议行，类别/地域各有独立「采用」按钮，标签逐个 `+` 点击添加，已采用项显示绿色 ✓，`×` 可关闭；返回值在前端用 CATEGORIES / REGIONS 字典校验过滤，非法值不展示
- [x] WebKit 封面缓存竞态修复：`useEffect` 首次运行时检查 `img.complete` + `naturalWidth`，已从缓存同步加载的图片直接设 `imgLoaded=true`，避免 `onLoad` 事件错过导致封面灰屏

---

## 七、关键设计决策

| 决策 | 原因 |
|------|------|
| `SELECT_COLS` 常量 + `row_to_book` 按索引映射 | 避免字段顺序不一致导致的 bug |
| `bookcover://` 自定义协议 | 安全地服务本地封面，防路径穿越 |
| `data-tauri-drag-region` 需显式声明 `core:window:allow-start-dragging` | 不在 `core:default` 中，需手动加入 capabilities |
| 豆瓣 Cookie 存 config.json | 避免硬编码，用户可自行更新过期 Cookie |
| 豆瓣 Cookie 失效检测 via 跳转 URL | 响应 URL 含 `accounts.douban.com`/`/login` 即判定失效，优先于 HTML 内容解析；有 Cookie 时失效错误上抛，无 Cookie 时静默 fallback |
| `push_field!` 用 `NULLIF(?,'')`  | 编辑清空字段后保存会产生空字符串而非 NULL；统一在写入层转换，无需前端额外校验 |
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
| 豆瓣 Cookie 提取用 `WKHTTPCookieStore.getAllCookies` | `eval()` 单向（Rust→JS），`fetch` 被 CSP 拦截，`location.hash` 被 SPA 重置；唯一可行路径是通过 `with_webview` 拿到 WKWebView 指针，调用原生 cookie store；completion block 用 `Mutex<Option<Sender>>` 包装以满足 `Fn` 约束 |

---

## 八、后续可扩展方向

- iCloud / 本地 NAS 同步
- 借阅记录
- AI 外延发现：基于偏好向外检索推荐书目（超出现有「想读」范围）
