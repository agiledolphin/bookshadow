import { useRef, useState } from "react";
import type { Book } from "../types/book";

interface Props {
  books: Book[];
  onSelect: (book: Book) => void;
  onDelete: (book: Book) => void;
}

export function BookList({ books, onSelect, onDelete }: Props) {
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            </div>
            <div className="text-right shrink-0 hidden sm:block">
              <p className="text-xs text-gray-400">{book.category ?? ""}</p>
              <p className="text-xs text-gray-400">{book.region ?? ""}</p>
            </div>
            <div className={`shrink-0 flex gap-1 transition-opacity ${confirming ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
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
    </div>
  );
}
