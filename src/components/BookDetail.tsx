import { useEffect, useState } from "react";
import type { Book } from "../types/book";
import { STATUSES } from "../types/book";

function localCoverSrc(path: string): string {
  const filename = path.split("/").pop() ?? "";
  return `bookcover://localhost/${filename}`;
}
import { StarRating } from "./StarRating";
import { ReviewEditor } from "./ReviewEditor";

interface Props {
  book: Book;
  onClose: () => void;
}

export function BookDetail({ book, onClose }: Props) {
  const [descExpanded, setDescExpanded] = useState(false);
  const statusLabel = STATUSES.find((s) => s.value === book.status)?.label;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">
          <div className="shrink-0 flex items-center justify-between p-5 border-b">
            <h2 className="text-lg font-semibold truncate pr-4">{book.title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer shrink-0">×</button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-5 flex gap-6">
              {/* Cover */}
              <div className="w-32 shrink-0">
                <div className="aspect-[2/3] bg-gray-100 rounded-lg overflow-hidden">
                  {book.cover_local ? (
                    <img
                      key={book.cover_local}
                      src={localCoverSrc(book.cover_local)}
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">📚</div>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {book.author && <p className="text-gray-700 font-medium">{book.author}</p>}
                {book.translator && <p className="text-gray-500 text-sm mt-0.5">译者：{book.translator}</p>}
                <div className="mt-2 flex items-center gap-3">
                  <StarRating value={book.rating ?? 0} readonly />
                  {statusLabel && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      book.status === "want"    ? "bg-yellow-100 text-yellow-700" :
                      book.status === "reading" ? "bg-blue-100 text-blue-700" :
                                                  "bg-green-100 text-green-700"
                    }`}>
                      {statusLabel}
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-500">
                  {book.isbn && <InfoRow label="ISBN" value={book.isbn} />}
                  {book.publisher && <InfoRow label="出版社" value={book.publisher} />}
                  {book.pub_date && <InfoRow label="出版时间" value={book.pub_date} />}
                  {book.language && <InfoRow label="语言" value={book.language} />}
                  {book.region && <InfoRow label="地域" value={book.region} />}
                  {book.category && <InfoRow label="类别" value={book.category} />}
                </div>
                {book.description && (
                  <div className="mt-3">
                    <p className={`text-sm text-gray-600 leading-relaxed ${descExpanded ? "" : "line-clamp-4"}`}>
                      {book.description}
                    </p>
                    <button
                      onClick={() => setDescExpanded((v) => !v)}
                      className="mt-1 text-xs text-blue-500 hover:text-blue-700 cursor-pointer"
                    >
                      {descExpanded ? "收起" : "展开"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t">
              <ReviewEditor bookId={book.id} />
            </div>
          </div>
        </div>
      </div>

    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="text-gray-400 shrink-0">{label}:</span>
      <span className="text-gray-700 truncate">{value}</span>
    </div>
  );
}
