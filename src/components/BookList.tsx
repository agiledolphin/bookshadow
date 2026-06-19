import { useEffect, useRef, useState } from "react";
import type { Book } from "../types/book";

interface Props {
  books: Book[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onSelect: (book: Book) => void;
  onOpenReviews: (book: Book) => void;
  onDelete: (book: Book) => void;
  onMarkPurchased: (book: Book) => void;
  onLoadMore: () => void;
}

export function BookList({ books, hasMore, isLoadingMore, onSelect, onOpenReviews, onDelete, onMarkPurchased, onLoadMore }: Props) {
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore]);

  const handleDeleteClick = (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    if (confirmingId === book.id) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirmingId(null);
      onDelete(book);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirmingId(book.id);
      timerRef.current = setTimeout(() => setConfirmingId(null), 2000);
    }
  };

  if (books.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p className="text-sm">暂无书籍</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
      {books.map((book) => {
        const confirming = confirmingId === book.id;
        return (
          <div
            key={book.id}
            onClick={() => onSelect(book)}
            className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-14 bg-gray-100 rounded overflow-hidden shrink-0">
              {book.cover_local ? (
                <img src={`bookcover://localhost/${book.cover_local.split("/").pop()}`} alt={book.title} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">📚</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900 truncate">{book.title}</p>
              <p className="text-xs text-gray-500 truncate">{book.author ?? "—"}</p>
            </div>
            <div className="text-right shrink-0">
              {book.rating && (
                <p className="text-amber-400 text-xs">{"★".repeat(book.rating)}</p>
              )}
              <p className="text-xs text-gray-400">{book.pub_date ?? ""}</p>
              {(book.review_count ?? 0) > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenReviews(book); }}
                  title="查看书评"
                  className="flex items-center gap-0.5 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 px-1.5 py-0.5 rounded-full transition-colors cursor-pointer ml-auto"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  {book.review_count}
                </button>
              )}
            </div>
            <div className="text-right shrink-0 hidden sm:block">
              <p className="text-xs text-gray-400">{book.category ?? ""}</p>
              <p className="text-xs text-gray-400">{book.region ?? ""}</p>
            </div>
            <div className={`shrink-0 flex items-center gap-1 transition-opacity ${confirming ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
              {book.status === "tobuy" && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkPurchased(book); }}
                  title="已购入，移入书库"
                  className="px-2 py-0.5 rounded text-xs font-medium text-orange-600 hover:bg-orange-50 cursor-pointer"
                >
                  ✓ 已购入
                </button>
              )}
              <button
                onClick={(e) => handleDeleteClick(e, book)}
                title={confirming ? "再次点击确认删除" : "删除"}
                className={`p-1.5 rounded transition-colors cursor-pointer ${confirming ? "text-red-500 bg-red-50" : "text-gray-400 hover:text-red-500 hover:bg-red-50"}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
      <div ref={sentinelRef} className="h-px" />
      {isLoadingMore && (
        <div className="py-4 text-center text-sm text-gray-400">加载中…</div>
      )}
      {!hasMore && books.length > 0 && (
        <div className="py-4 text-center text-xs text-gray-300">已加载全部 {books.length} 本</div>
      )}
    </div>
  );
}
