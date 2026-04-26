import { useEffect, useRef } from "react";
import type { Book } from "../types/book";
import { BookCard } from "./BookCard";

interface Props {
  books: Book[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onSelect: (book: Book) => void;
  onDelete: (book: Book) => void;
  onLoadMore: () => void;
}

export function BookGrid({ books, hasMore, isLoadingMore, onSelect, onDelete, onLoadMore }: Props) {
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

  if (books.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-sm">暂无书籍</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4 p-4">
        {books.map((book) => (
          <BookCard key={book.id} book={book} onClick={() => onSelect(book)} onDelete={() => onDelete(book)} />
        ))}
      </div>
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
