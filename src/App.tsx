import { useEffect, useState, useCallback, useRef } from "react";
import { useBookStore } from "./stores/bookStore";
import { useToastStore } from "./stores/toastStore";
import type { Book } from "./types/book";
import { FilterPanel } from "./components/FilterPanel";
import { BookGrid } from "./components/BookGrid";
import { BookList } from "./components/BookList";
import { BookDetail } from "./components/BookDetail";
import { BookForm } from "./components/BookForm";
import { SettingsModal } from "./components/SettingsModal";
import { BatchImportModal } from "./components/BatchImportModal";
import { DiscoverModal } from "./components/DiscoverModal";
import { StatsPanel } from "./components/StatsPanel";
import { Toast } from "./components/Toast";
import "./App.css";

export default function App() {
  const { books, filters, viewMode, stats, loading, hasMore, isLoadingMore, fetchBooks, loadMoreBooks, setSearchQuery, setFilters, setViewMode, setSortBy, deleteBook, updateBook, recommendations, recommendationsLoading, fetchRecommendations, clearRecommendations } = useBookStore();
  const { addToast } = useToastStore();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBooks();
  }, []);

  // Sync input when store clears search_query (e.g. filter panel "全部")
  useEffect(() => {
    if (!filters.search_query) setQuery("");
  }, [filters.search_query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleDelete = async (book: Book) => {
    try {
      await deleteBook(book.id);
    } catch (err) {
      addToast(String(err));
    }
  };

  const handleMarkPurchased = async (book: Book) => {
    try {
      await updateBook(book.id, { status: "want" });
      fetchBooks(true);
    } catch (err) {
      addToast(String(err));
    }
  };

  // BookDetail ← / → navigation
  useEffect(() => {
    if (!selectedBook) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
      const idx = books.findIndex((b) => b.id === selectedBook.id);
      if (idx === -1) return;
      if (e.key === "ArrowLeft" && idx > 0) setSelectedBook(books[idx - 1]);
      if (e.key === "ArrowRight" && idx < books.length - 1) setSelectedBook(books[idx + 1]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedBook, books]);

  // ESC when nothing is open → exit stats view if active, then reset all filters
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
      if (selectedBook || showForm || showSettings || showBatchImport || showDiscover) return;
      if (viewMode === "stats") setViewMode("grid");
      setFilters({});
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedBook, showForm, showSettings, showBatchImport, showDiscover, viewMode, setViewMode, setFilters]);

  // Sort books by recommendation score when active
  const displayBooks = recommendations && filters.status === "want"
    ? [...books].sort((a, b) => (recommendations[b.id]?.score ?? -1) - (recommendations[a.id]?.score ?? -1))
    : books;

  const handleRecommend = async () => {
    try {
      await fetchRecommendations();
    } catch (e) {
      addToast(String(e));
    }
  };

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(q);
    }, 300);
  }, [setSearchQuery]);

  return (
    <div className="flex flex-col h-screen bg-white select-none overflow-hidden">
      {/* Top bar — single border-b spans full width */}
      <div className="flex shrink-0 border-b border-gray-100 bg-white">
        <div data-tauri-drag-region className={`w-36 shrink-0 ${viewMode !== "stats" ? "border-r border-gray-100" : ""}`} />
        <header data-tauri-drag-region className="flex-1 flex items-center gap-2 px-4 py-2">
          {/* Group 1: browsing tools */}
          <div className="flex-1 max-w-sm relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => { if (viewMode === "stats") setViewMode("grid"); }}
              onKeyDown={(e) => { if (e.key === "Escape") handleSearch(""); }}
              placeholder="搜索书名、作者、简介…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {viewMode !== "stats" && (
            <select
              value={filters.sort_by ?? "created_at_desc"}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
            >
              <option value="created_at_desc">加入时间 ↓</option>
              <option value="created_at_asc">加入时间 ↑</option>
              <option value="title_asc">书名</option>
              <option value="pub_date_desc">出版年份 新→旧</option>
              <option value="pub_date_asc">出版年份 旧→新</option>
              <option value="rating_desc">评分 高→低</option>
            </select>
          )}

          {viewMode !== "stats" && (
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded cursor-pointer ${viewMode === "grid" ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
                title="网格视图"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 8a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zm6-8a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2h-2zm0 8a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded cursor-pointer ${viewMode === "list" ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
                title="列表视图"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
          )}

          <div className="h-4 w-px bg-gray-200 shrink-0" />

          {/* Group 2: analytics + AI */}
          <button
            onClick={() => setViewMode(viewMode === "stats" ? "grid" : "stats")}
            title="统计看板"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${viewMode === "stats" ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>

          {filters.status === "want" && viewMode !== "stats" && (
            <button
              onClick={recommendations ? clearRecommendations : handleRecommend}
              disabled={recommendationsLoading}
              title={recommendations ? "清除推荐排序" : "AI 推荐排序"}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 ${
                recommendations
                  ? "bg-purple-100 text-purple-600 hover:bg-purple-200"
                  : "text-gray-400 hover:text-purple-600 hover:bg-purple-50"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {recommendationsLoading ? "分析中…" : recommendations ? "已推荐排序" : "AI 推荐"}
            </button>
          )}

          {filters.status === "tobuy" && viewMode !== "stats" && (
            <button
              onClick={() => setShowDiscover(true)}
              title="AI 发现推荐书目"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              AI 发现
            </button>
          )}

          <div className="h-4 w-px bg-gray-200 shrink-0" />

          {/* Group 3: content actions */}
          <button
            onClick={() => setShowBatchImport(true)}
            title="批量导入"
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>

          <button
            onClick={() => setShowForm(true)}
            title="新增书籍"
            className="p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <div className="h-4 w-px bg-gray-200 shrink-0" />

          {/* Group 4: settings */}
          <button
            onClick={() => setShowSettings(true)}
            title="设置"
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Brand — pushed to right edge */}
          <button
            onClick={() => { setFilters({}); if (viewMode === "stats") setViewMode("grid"); }}
            title="回到全部（ESC）"
            className="flex items-center gap-2 ml-auto cursor-pointer hover:opacity-70 transition-opacity select-none"
          >
            <div className="flex flex-col items-center gap-0.5 leading-none">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6.5C2 5.12 3.12 4 4.5 4H12v16H4.5A2.5 2.5 0 0 1 2 17.5v-11Z" />
                <path d="M12 4h7.5C20.88 4 22 5.12 22 6.5v11A2.5 2.5 0 0 1 19.5 20H12V4Z" />
                <path d="M12 4v16" />
              </svg>
              <span className="text-[10px] font-bold tracking-[0.18em] text-gray-800">书影</span>
            </div>
            <div className="flex flex-col leading-none gap-0.5">
              <span className="text-[10px] font-light tracking-[0.22em] text-gray-800 uppercase">BOOK</span>
              <span className="text-[10px] font-bold tracking-[0.1em] text-gray-800 uppercase">SHADOW</span>
            </div>
          </button>
        </header>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {viewMode !== "stats" && <FilterPanel />}

        <main className="flex-1 min-h-0 flex flex-col min-w-0">
          {viewMode === "stats" ? (
            stats ? (
              <StatsPanel stats={stats} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <span className="text-sm">加载中…</span>
              </div>
            )
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <span className="text-sm">加载中…</span>
            </div>
          ) : viewMode === "grid" ? (
            <BookGrid books={displayBooks} hasMore={hasMore} isLoadingMore={isLoadingMore} onSelect={setSelectedBook} onDelete={handleDelete} onMarkPurchased={handleMarkPurchased} onLoadMore={loadMoreBooks} />
          ) : (
            <BookList books={displayBooks} hasMore={hasMore} isLoadingMore={isLoadingMore} onSelect={setSelectedBook} onDelete={handleDelete} onMarkPurchased={handleMarkPurchased} onLoadMore={loadMoreBooks} />
          )}
        </main>
      </div>

      {selectedBook && (() => {
        const idx = books.findIndex((b) => b.id === selectedBook.id);
        return (
          <BookDetail
            book={selectedBook}
            onClose={() => setSelectedBook(null)}
            onPrev={idx > 0 ? () => setSelectedBook(books[idx - 1]) : null}
            onNext={idx < books.length - 1 ? () => setSelectedBook(books[idx + 1]) : null}
          />
        );
      })()}

      {showForm && <BookForm onClose={() => { setShowForm(false); fetchBooks(); }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showBatchImport && <BatchImportModal onClose={() => setShowBatchImport(false)} />}
      {showDiscover && <DiscoverModal onClose={() => setShowDiscover(false)} />}
      <Toast />
    </div>
  );
}
