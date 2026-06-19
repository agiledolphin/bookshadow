import { useRef, useState, useEffect } from "react";
import type { Book } from "../types/book";
import { useBookStore } from "../stores/bookStore";

function localCoverSrc(path: string, nonce?: number): string {
  const filename = path.split("/").pop() ?? "";
  return `bookcover://localhost/${filename}${nonce ? `?v=${nonce}` : ""}`;
}

interface Props {
  book: Book;
  onClick: () => void;
  onOpenReviews: () => void;
  onDelete: () => void;
  onMarkPurchased: () => void;
}

export function BookCard({ book, onClick, onOpenReviews, onDelete, onMarkPurchased }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const nonce = useBookStore((s) => s.coverNonce[book.id]);
  const recommendation = useBookStore((s) => s.recommendations?.[book.id]);

  useEffect(() => {
    if (!book.cover_local) {
      setImgLoaded(false);
      setImgError(false);
      return;
    }
    const img = imgRef.current;
    // Cached image: browser loads synchronously before React attaches onLoad → check immediately
    if (img?.complete) {
      if (img.naturalWidth > 0) { setImgLoaded(true); setImgError(false); }
      else { setImgLoaded(false); setImgError(true); }
      return;
    }
    setImgLoaded(false);
    setImgError(false);
    // Fallback for async loads where onLoad/onError don't fire (WebKit custom protocol quirk)
    const t = setTimeout(() => {
      const img = imgRef.current;
      if (!img || img.naturalWidth === 0) setImgError(true);
      else setImgLoaded(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [book.cover_local, nonce]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirming(false);
      onDelete();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 2000);
    }
  };

  return (
    <div
      onClick={onClick}
      className="group bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md hover:border-blue-300 transition-all flex flex-col"
    >
      <div className="aspect-[2/3] bg-gray-100 overflow-hidden relative">
        {book.cover_local && !imgError ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 bg-gray-200 animate-pulse" />
            )}
            <img
              ref={imgRef}
              key={`${book.cover_local}-${nonce}`}
              src={localCoverSrc(book.cover_local, nonce)}
              alt={book.title}
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
        )}
        {book.rating && (
          <div className="absolute top-1.5 right-1.5 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-full">
            {"★".repeat(book.rating)}
          </div>
        )}
        {recommendation && (
          <div className="absolute top-1.5 left-1.5 bg-purple-600/85 text-white text-xs px-1.5 py-0.5 rounded-full">
            ✦ {recommendation.score.toFixed(1)}
          </div>
        )}
        {book.status && !recommendation && (
          <div className={`absolute bottom-1.5 left-1.5 w-2.5 h-2.5 rounded-full ring-1 ring-white/60 ${
            book.status === "want" ? "bg-yellow-400" :
            book.status === "reading" ? "bg-blue-400" :
            book.status === "tobuy" ? "bg-orange-400" : "bg-green-400"
          }`} title={
            book.status === "want" ? "想读" :
            book.status === "reading" ? "在读" :
            book.status === "tobuy" ? "待购" : "已读"
          } />
        )}
        {recommendation && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent px-2 pt-4 pb-1.5">
            <p className="text-white text-[10px] leading-tight line-clamp-2">{recommendation.reason}</p>
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1">
        {/* 固定两行高度，保证跨卡片书名对齐 */}
        <h3 className="font-medium text-gray-900 text-sm line-clamp-2 leading-snug h-[2.625rem]">{book.title}</h3>
        {/* 始终占一行高度，无作者时留空 */}
        <p className="text-xs text-gray-500 mt-1 truncate h-4">{book.author ?? ""}</p>
        {/* 底部行：类别 + 年份 + 按钮，单行不换行 */}
        <div className="mt-auto pt-1.5 flex items-center gap-1">
          {book.category && (
            <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded shrink-0">{book.category}</span>
          )}
          {book.pub_date && (
            <span className="text-xs text-gray-400 shrink-0">{book.pub_date.slice(0, 4)}</span>
          )}
          {(book.review_count ?? 0) > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenReviews(); }}
              title="查看书评"
              className="flex items-center gap-0.5 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 px-1.5 py-0.5 rounded-full transition-colors cursor-pointer shrink-0"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {book.review_count}
            </button>
          )}
          {/* action icons — visible on hover */}
          <div className={`ml-auto shrink-0 flex gap-1 transition-opacity ${confirming ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            {book.status === "tobuy" && (
              <button
                onClick={(e) => { e.stopPropagation(); onMarkPurchased(); }}
                title="已购入，移入书库"
                className="px-1.5 py-0.5 rounded text-[10px] font-medium text-orange-600 hover:bg-orange-50 cursor-pointer"
              >
                ✓ 已购入
              </button>
            )}
            <button
              onClick={handleDeleteClick}
              title={confirming ? "再次点击确认删除" : "删除"}
              className={`p-1 rounded transition-colors cursor-pointer ${confirming ? "text-red-500 bg-red-50" : "text-gray-400 hover:text-red-500 hover:bg-red-50"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
