# 书影 BookShadow

家庭藏书管理桌面应用，基于 Tauri 2 + Rust + React 构建。

## 功能

- **书籍管理**：新增、编辑、删除书籍，支持封面、简介、评分、地域、类别、语言等字段
- **内联编辑**：在书籍详情页直接切换编辑模式，无需另开弹层；封面保持可见便于对照
- **阅读状态**：标记书籍为「想读」「在读」「已读」，书卡封面显示彩色圆点，筛选面板显示各状态数量
- **ISBN 自动填充**：输入 ISBN 或豆瓣链接（`book.douban.com/subject/…`），自动从豆瓣、Google Books、Open Library 拉取书籍元数据，封面自动下载缓存
- **批量导入**：打开导入面板后可拖拽图片或点击选择，自动识别条形码（EAN-13），批量从豆瓣等平台抓取元数据并导入
- **筛选**：按阅读状态、星级、地域、类别、语言、年代多维筛选
- **全文搜索**：书名、作者、简介全文搜索（支持中文）
- **书评**：每本书可写多篇 Markdown 书评，支持编辑/预览切换，支持从 `.md` 文件导入
- **网格 / 列表**：两种书籍浏览视图，窗口大小和位置自动记忆

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite |
| 样式 | Tailwind CSS v4 |
| 状态 | Zustand |
| Markdown 编辑器 | CodeMirror 6 |
| 桌面壳 | Tauri 2 |
| 后端 | Rust |
| 数据库 | SQLite（rusqlite bundled） |
| 搜索 | SQLite FTS5 + LIKE 兜底 |
| 条码识别 | rxing（EAN-13，纯 Rust） |

## 数据存储

所有数据存储在用户目录：

```
~/.bookshadow/
├── sqlite/bookshadow.db   # 书籍与书评数据库
├── covers/                # 封面图片本地缓存
└── config.json            # 应用配置
```

`config.json` 支持的字段：

| 字段 | 说明 |
|------|------|
| `google_books_api_key` | Google Books API Key，留空使用匿名访问（每日有配额限制） |
| `douban_cookie` | 豆瓣登录 Cookie，用于绕过反爬限制。从浏览器开发者工具 Network → Cookie 复制完整值 |

## 开发

```bash
# 安装依赖
npm install

# 启动开发（热重载，含 Rust 编译）
npm run tauri dev

# 仅启动前端预览
npm run dev

# 类型检查
npx tsc --noEmit

# 构建发布包
npm run tauri build
```

> Rust 由 Tauri 构建系统编译，无需单独运行 `cargo`。

## ISBN 数据源优先级

1. **豆瓣读书** — 中文书元数据质量最佳（需配置 Cookie 以避免被拦截）；也支持直接粘贴豆瓣书籍链接（`book.douban.com/subject/…`）精确抓取特定版本
2. **Google Books** — 外文书回退（支持配置 API Key）
3. **Open Library** — 最终回退

支持手动选择数据源，也可选「自动」按优先级级联尝试。
