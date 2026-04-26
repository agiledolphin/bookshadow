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
import { Toast } from "./components/Toast";
import "./App.css";

export default function App() {
  const { books, viewMode, loading, hasMore, isLoadingMore, fetchBooks, loadMoreBooks, refreshAllBooks, searchBooks, setViewMode, deleteBook } = useBookStore();
  const { addToast } = useToastStore();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBooks();
    refreshAllBooks();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
      e.preventDefault();
      searchInputRef.current?.focus();
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
      if (q.trim()) searchBooks(q);
      else fetchBooks();
    }, 300);
  }, [searchBooks, fetchBooks]);

  return (
    <div className="flex h-screen bg-white select-none overflow-hidden">
      <FilterPanel />

      <div className="flex-1 flex flex-col min-h-0">
        {/* Toolbar */}
        <header data-tauri-drag-region className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-white shrink-0">
          <div className="flex-1 max-w-sm relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索书名、作者、简介…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

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
        </header>

        <main className="flex-1 min-h-0 flex flex-col min-w-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <span className="text-sm">加载中…</span>
            </div>
          ) : viewMode === "grid" ? (
            <BookGrid books={books} hasMore={hasMore} isLoadingMore={isLoadingMore} onSelect={setSelectedBook} onDelete={handleDelete} onLoadMore={loadMoreBooks} />
          ) : (
            <BookList books={books} hasMore={hasMore} isLoadingMore={isLoadingMore} onSelect={setSelectedBook} onDelete={handleDelete} onLoadMore={loadMoreBooks} />
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
      <Toast />
    </div>
  );
}
