import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { DiscoveredBook, CreateBook } from "../types/book";
import { useBookStore } from "../stores/bookStore";
import { useToastStore } from "../stores/toastStore";

interface Props {
  onClose: () => void;
}

export function DiscoverModal({ onClose }: Props) {
  const { discoverBooks, enrichBook, createBook, fetchBooks } = useBookStore();
  const { addToast } = useToastStore();
  const [loading, setLoading] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [books, setBooks] = useState<DiscoveredBook[]>([]);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState<Set<number>>(new Set());
  const [addingAll, setAddingAll] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Intercept before any bubble-phase handlers (parent ESC handlers)
      e.stopImmediatePropagation();
      if (loading || addingAll) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [loading, addingAll, onClose]);

  const handleDiscover = async () => {
    setLoading(true);
    setProgressLog([]);
    setBooks([]);
    setAdded(new Set());
    // Register listener BEFORE invoking the command so no events are missed
    const unlisten = await listen<string>("discover_progress", e => {
      setProgressLog(prev => [...prev, e.payload]);
    });
    try {
      const results = await discoverBooks();
      setBooks(results);
      if (results.length === 0) {
        addToast("AI 未能生成推荐，请确认 AI 配置是否正确");
      } else {
        // Keep loading visible briefly so the final log state (✓✓✓) is readable
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) {
      addToast(String(e));
    } finally {
      setLoading(false);
      unlisten();
    }
  };

  const handleAdd = async (book: DiscoveredBook, idx: number) => {
    setAdding(prev => new Set(prev).add(idx));
    try {
      // Fetch metadata on demand when user clicks "加入待购"
      const enriched = await enrichBook(book.title, book.author ?? "");
      const payload: CreateBook = {
        title: enriched.title || book.title,
        author: enriched.author ?? book.author,
        status: "tobuy",
        cover_url: enriched.cover_url,
        isbn: enriched.isbn,
        publisher: enriched.publisher,
        pub_date: enriched.pub_date,
        language: enriched.language ?? "中文",
        category: enriched.category ?? book.category,
        region: enriched.region ?? book.region,
        description: enriched.description,
      };
      await createBook(payload);
      setAdded(prev => new Set(prev).add(idx));
      fetchBooks(true);
    } catch (e) {
      addToast(String(e));
    } finally {
      setAdding(prev => { const s = new Set(prev); s.delete(idx); return s; });
    }
  };

  const handleAddAll = async () => {
    setAddingAll(true);
    try {
      for (let i = 0; i < books.length; i++) {
        if (!added.has(i)) await handleAdd(books[i], i);
      }
    } finally {
      setAddingAll(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-[680px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-purple-600 font-semibold text-sm">✦ AI 发现</span>
            {books.length > 0 && (
              <span className="text-xs text-gray-400">共 {books.length} 本推荐</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {!loading && books.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-gray-400">
              <p className="text-sm">根据你的藏书偏好，AI 将推荐你可能感兴趣但尚未拥有的书</p>
              <button
                onClick={handleDiscover}
                className="px-5 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 cursor-pointer"
              >
                开始发现
              </button>
            </div>
          )}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-5">
              <div className="w-6 h-6 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
              <div className="flex flex-col gap-1.5 min-w-[200px]">
                {progressLog.length === 0 && (
                  <p className="text-sm text-gray-400">正在准备…</p>
                )}
                {progressLog.map((msg, i) => {
                  const isActive = i === progressLog.length - 1;
                  return (
                    <div key={i} className={`flex items-center gap-2 text-sm ${
                      isActive ? "text-purple-600 font-medium" : "text-gray-400"
                    }`}>
                      <span className="w-3 text-center text-xs shrink-0">
                        {isActive ? "›" : "✓"}
                      </span>
                      <span>{msg}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!loading && books.length > 0 && (
            <div className="flex flex-col gap-3">
              {books.map((book, i) => {
                const isAdded = added.has(i);
                const isAdding = adding.has(i);
                return (
                  <div key={i} className="flex gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-gray-50">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-800 truncate">{book.title}</p>
                      {book.author && <p className="text-xs text-gray-500 truncate">{book.author}</p>}
                      <p className="text-xs text-purple-600 mt-1 line-clamp-2">{book.reason}</p>
                    </div>
                    {/* Action */}
                    <div className="flex items-center shrink-0">
                      {isAdded ? (
                        <span className="text-xs text-green-600 font-medium">✓ 已加入</span>
                      ) : (
                        <button
                          onClick={() => handleAdd(book, i)}
                          disabled={isAdding}
                          className="px-3 py-1.5 text-xs bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 disabled:opacity-50 cursor-pointer disabled:cursor-default"
                        >
                          {isAdding ? "查询中…" : "加入待购"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && books.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <button
              onClick={handleDiscover}
              className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              重新生成
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-1.5 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
                关闭
              </button>
              <button
                onClick={handleAddAll}
                disabled={addingAll || added.size === books.length}
                className="px-4 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 cursor-pointer disabled:cursor-default"
              >
                {addingAll ? "加入中…" : "全部加入待购"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
