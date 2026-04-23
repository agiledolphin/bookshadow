# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server (Vite frontend only)
npm run dev

# Start full Tauri app (Rust + frontend, hot-reload)
npm run tauri dev

# Type-check frontend
npx tsc --noEmit

# Build release app
npm run tauri build

# Build frontend only
npm run build
```

Rust is compiled by Tauri's build system — there is no separate `cargo run`. To iterate on Rust code, use `npm run tauri dev`.

## Architecture

**書影 BookShadow** is a Tauri 2 desktop app for personal book management.

### Stack
- **Frontend**: React 19 + TypeScript + Vite, Tailwind CSS v4 (`@tailwindcss/vite` plugin — NOT the PostCSS approach), Zustand state, CodeMirror 6 (review editor)
- **Backend**: Rust (Tauri 2), SQLite via `rusqlite` (bundled), `reqwest` (rustls-tls), `scraper` for HTML parsing

### Data flow
Frontend invokes Tauri commands via `invoke()` → Rust handlers in `src-tauri/src/commands/` → SQLite via `DbState(Mutex<Connection>)` managed state.

### Rust modules (`src-tauri/src/`)
- `lib.rs` — Tauri builder, registers all commands, initializes DB
- `db/mod.rs` — `init_db()` opens `~/.bookshadow/sqlite/bookshadow.db`, runs migrations; `db/schema.rs` — DDL + migration (ALTER TABLE for new columns)
- `commands/book.rs` — CRUD for books; `pub const SELECT_COLS` shared with search
- `commands/review.rs` — CRUD for reviews + `.md` import via `tauri-plugin-dialog`
- `commands/search.rs` — FTS5 full-text search; uses `pub SELECT_COLS` from `book.rs`
- `isbn/mod.rs` — `BookMeta` struct + cascade: Douban → Google Books → Open Library
- `isbn/douban.rs` — HTML scraping of `book.douban.com/isbn/{isbn}/`; handles `\u{a0}` nbsp and standalone ":" tokens in `#info`; parses `[国籍]` prefix from author → clean name + region

### Frontend modules (`src/`)
- `App.tsx` — layout: sidebar (FilterPanel) + main area (toolbar, BookGrid/BookList, BookDetail)
- `stores/bookStore.ts` — Zustand store, wraps all Tauri invocations
- `types/book.ts` — all TypeScript types + `LANGUAGES`, `REGIONS` (40-country dropdown), `PRIMARY_REGIONS` (7 for filter panel), `CATEGORIES`, `RATINGS`
- `components/FilterPanel.tsx` — derives `otherRegions` via `useMemo` from books data (countries not in `PRIMARY_REGIONS`), shown in collapsible "其他" section

### Key invariants
- `SELECT_COLS` in `book.rs` lists 17 columns in fixed order; `row_to_book` maps by index. Any schema change must update both.
- Douban scraping: `parse_info()` must handle `\u{a0}` with `trim_matches(|c: char| c.is_whitespace() || c == '\u{a0}')` — standard `.trim()` does not strip non-breaking spaces.
- The `REGIONS` constant (BookForm dropdown) and `nationality_to_region()` in `douban.rs` must stay in sync when adding new countries.
- `tauri-plugin-dialog` config: use `"plugins": {}` in `tauri.conf.json` — adding `"dialog": {}` causes a parse error.
