import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Book, BookMeta } from "../types/book";
import { useBookStore } from "../stores/bookStore";

type RowPhase =
  | "scanning"
  | "scan_failed"
  | "fetching"
  | "ready"
  | "not_found"
  | "duplicate"
  | "error"
  | "importing"
  | "imported";

interface ImportRow {
  id: number;
  filePath: string;
  fileName: string;
  thumbnail: string;
  isbn: string;
  manualIsbn: string;
  phase: RowPhase;
  meta: BookMeta | null;
  existingBook: Book | null;
  errorMsg: string;
  selected: boolean;
}

interface ScanResult {
  isbn: string | null;
  thumbnail: string;
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? "w-4 h-4"}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function RowItem({
  row,
  onToggle,
  onManualIsbn,
  onRetry,
}: {
  row: ImportRow;
  onToggle: () => void;
  onManualIsbn: (v: string) => void;
  onRetry: () => void;
}) {
  const inProgress = ["scanning", "fetching", "importing"].includes(row.phase);

  const rowBg =
    row.phase === "imported" ? "bg-green-50" :
    row.phase === "duplicate" ? "bg-amber-50" :
    row.phase === "error" ? "bg-red-50" :
    "bg-gray-50";

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${rowBg}`}>
      {/* Thumbnail */}
      <div className="w-10 h-14 bg-gray-200 rounded overflow-hidden shrink-0 flex items-center justify-center">
        {row.thumbnail ? (
          <img src={row.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : inProgress ? (
          <Spinner className="w-4 h-4 text-gray-400" />
        ) : (
          <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400 truncate mb-0.5">{row.fileName}</p>

        {row.phase === "scanning" && (
          <p className="text-sm text-gray-400">扫描条码中…</p>
        )}

        {row.phase === "scan_failed" && (
          <div>
            <p className="text-xs text-orange-500 mb-1">条码未识别</p>
            <div className="flex items-center gap-1">
              <input
                value={row.manualIsbn}
                onChange={e => onManualIsbn(e.target.value)}
                onKeyDown={e => e.key === "Enter" && row.manualIsbn.trim() && onRetry()}
                placeholder="手动输入 ISBN"
                className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={onRetry}
                disabled={!row.manualIsbn.trim()}
                className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 border border-blue-200 rounded disabled:opacity-40 shrink-0 cursor-pointer"
              >
                查询
              </button>
            </div>
          </div>
        )}

        {row.phase === "fetching" && (
          <div className="flex items-center gap-1.5">
            <Spinner className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-gray-500 font-mono">{row.isbn}</span>
            <span className="text-xs text-gray-400">获取书籍信息…</span>
          </div>
        )}

        {row.phase === "ready" && (
          <div>
            <p className="text-sm font-medium text-gray-800 truncate">{row.meta?.title}</p>
            <p className="text-xs text-gray-500 truncate">{row.meta?.author ?? ""}</p>
          </div>
        )}

        {row.phase === "not_found" && (
          <div>
            <p className="text-xs text-gray-500 mb-1">
              <span className="font-mono">{row.isbn}</span>
              <span className="ml-1 text-gray-400">· 未找到书籍信息</span>
            </p>
            <div className="flex items-center gap-1">
              <input
                value={row.manualIsbn}
                onChange={e => onManualIsbn(e.target.value)}
                onKeyDown={e => e.key === "Enter" && row.manualIsbn.trim() && onRetry()}
                placeholder="尝试其他 ISBN"
                className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                onClick={onRetry}
                disabled={!row.manualIsbn.trim()}
                className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 border border-blue-200 rounded disabled:opacity-40 shrink-0 cursor-pointer"
              >
                重试
              </button>
            </div>
          </div>
        )}

        {row.phase === "duplicate" && (
          <p className="text-xs text-amber-700 truncate">
            已存在：{row.existingBook?.title}
          </p>
        )}

        {row.phase === "error" && (
          <p className="text-xs text-red-500 truncate">{row.errorMsg}</p>
        )}

        {row.phase === "importing" && (
          <div className="flex items-center gap-1.5">
            <Spinner className="w-3 h-3 text-blue-400" />
            <span className="text-sm text-gray-500">导入中…</span>
          </div>
        )}

        {row.phase === "imported" && (
          <p className="text-sm font-medium text-green-700 truncate">{row.meta?.title}</p>
        )}
      </div>

      {/* Right action */}
      <div className="shrink-0 w-6 flex items-center justify-center">
        {row.phase === "ready" && (
          <input
            type="checkbox"
            checked={row.selected}
            onChange={onToggle}
            className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
          />
        )}
        {row.phase === "duplicate" && (
          <span className="text-[10px] font-medium text-amber-600 bg-amber-100 px-1 py-0.5 rounded whitespace-nowrap">
            跳过
          </span>
        )}
        {row.phase === "imported" && (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
    </div>
  );
}

export function BatchImportModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const isbnMapRef = useRef<Map<string, Book>>(new Map());
  const startedRef = useRef(false);
  const { fetchBooks } = useBookStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !importing) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, importing]);

  const updateRow = useCallback((id: number, updates: Partial<ImportRow>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const fetchMetaForRow = useCallback(
    async (id: number, isbn: string) => {
      try {
        const meta = await invoke<BookMeta>("fetch_by_isbn", { isbn, source: null });
        updateRow(id, {
          meta,
          phase: meta.title ? "ready" : "not_found",
          selected: !!meta.title,
        });
      } catch {
        updateRow(id, { phase: "not_found", selected: false });
      }
    },
    [updateRow]
  );

  // Phase 1: scan barcode + generate thumbnail (parallel-safe, CPU-bound in Rust)
  // Returns {id, isbn} if the row needs a metadata fetch, null otherwise
  const scanRow = useCallback(
    async (id: number, path: string): Promise<{ id: number; isbn: string } | null> => {
      try {
        const { isbn, thumbnail } = await invoke<ScanResult>("scan_isbn_image", { path });
        if (!isbn) {
          updateRow(id, { thumbnail, phase: "scan_failed", selected: false });
          return null;
        }
        const existingBook = isbnMapRef.current.get(isbn);
        if (existingBook) {
          updateRow(id, { thumbnail, isbn, phase: "duplicate", existingBook, selected: false });
          return null;
        }
        updateRow(id, { thumbnail, isbn, phase: "fetching" });
        return { id, isbn };
      } catch (err) {
        updateRow(id, { phase: "error", errorMsg: String(err) });
        return null;
      }
    },
    [updateRow]
  );

  useEffect(() => {
    // Guard: only run once even if deps change (onClose is not memoized in App.tsx)
    if (startedRef.current) return;
    startedRef.current = true;

    invoke<Book[]>("get_books", { filters: {} }).then(books => {
      isbnMapRef.current = new Map(books.filter(b => b.isbn).map(b => [b.isbn!, b]));
    });

    open({
      multiple: true,
      filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "webp"] }],
    }).then(result => {
      const paths = (result as string[] | null) ?? [];
      if (paths.length === 0) { onClose(); return; }

      setRows(
        paths.map((p, i) => ({
          id: i,
          filePath: p,
          fileName: p.split("/").pop() ?? p,
          thumbnail: "",
          isbn: "",
          manualIsbn: "",
          phase: "scanning",
          meta: null,
          existingBook: null,
          errorMsg: "",
          selected: true,
        }))
      );

      (async () => {
        const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

        // Phase 1: scan all images in parallel
        const results = await Promise.all(paths.map((p, i) => scanRow(i, p)));
        const fetchQueue = results.filter((x): x is { id: number; isbn: string } => x !== null);

        // Phase 2: fetch metadata sequentially, 1.2s between requests
        for (let i = 0; i < fetchQueue.length; i++) {
          if (i > 0) await delay(1200);
          await fetchMetaForRow(fetchQueue[i].id, fetchQueue[i].isbn);
        }
      })();
    });
  }, [onClose, scanRow, fetchMetaForRow]);

  const handleRetry = useCallback(
    async (id: number) => {
      const row = rows.find(r => r.id === id);
      if (!row || !row.manualIsbn.trim()) return;
      const isbn = row.manualIsbn.trim();

      const existingBook = isbnMapRef.current.get(isbn);
      if (existingBook) {
        updateRow(id, { isbn, phase: "duplicate", existingBook, selected: false });
        return;
      }
      updateRow(id, { isbn, phase: "fetching" });
      await fetchMetaForRow(id, isbn);
    },
    [rows, updateRow, fetchMetaForRow]
  );

  const handleImport = useCallback(async () => {
    setImporting(true);
    const snapshot = rows.filter(r => r.selected && r.phase === "ready" && r.meta?.title);
    const coverDownloads: Promise<void>[] = [];

    for (const row of snapshot) {
      updateRow(row.id, { phase: "importing" });
      try {
        const book = await invoke<Book>("create_book", {
          payload: {
            title: row.meta!.title!,
            author: row.meta!.author ?? null,
            isbn: row.isbn || null,
            publisher: row.meta!.publisher ?? null,
            pub_date: row.meta!.pub_date ?? null,
            language: row.meta!.language ?? null,
            region: row.meta!.region ?? null,
            category: row.meta!.category ?? null,
            cover_url: row.meta!.cover_url ?? null,
            description: row.meta!.description ?? null,
            translator: row.meta!.translator ?? null,
            tags: "[]",
            rating: row.meta!.rating ?? null,
            status: null,
          },
        });
        if (book.cover_url && !book.cover_local) {
          coverDownloads.push(
            invoke<string>("download_cover", { id: book.id, url: book.cover_url, isbn: book.isbn ?? null })
              .then(() => {}).catch(() => {})
          );
        }
        updateRow(row.id, { phase: "imported" });
      } catch (err) {
        updateRow(row.id, { phase: "error", errorMsg: String(err) });
      }
    }

    await fetchBooks(); // Show books immediately (covers may still be downloading)
    setImporting(false);

    // Refresh again once all covers have been downloaded to disk
    if (coverDownloads.length > 0) {
      Promise.all(coverDownloads).then(() => fetchBooks());
    }
  }, [rows, updateRow, fetchBooks]);

  const isProcessing = rows.some(r => ["scanning", "fetching", "importing"].includes(r.phase));
  const readySelected = rows.filter(r => r.phase === "ready" && r.selected).length;
  const importedCount = rows.filter(r => r.phase === "imported").length;
  const dupCount = rows.filter(r => r.phase === "duplicate").length;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={() => { if (!importing) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-gray-900">批量导入</h2>
          {rows.length > 0 && (
            <span className="ml-3 text-sm text-gray-400">
              {isProcessing ? "处理中…" : `共 ${rows.length} 张`}
              {dupCount > 0 && ` · ${dupCount} 本重复`}
              {importedCount > 0 && ` · 已导入 ${importedCount} 本`}
            </span>
          )}
          <button
            onClick={() => { if (!importing) onClose(); }}
            className="ml-auto p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm gap-2">
              <Spinner className="w-4 h-4 text-gray-400" />
              选择图片中…
            </div>
          ) : (
            rows.map(row => (
              <RowItem
                key={row.id}
                row={row}
                onToggle={() => updateRow(row.id, { selected: !row.selected })}
                onManualIsbn={v => updateRow(row.id, { manualIsbn: v })}
                onRetry={() => handleRetry(row.id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {rows.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2 shrink-0">
            <button
              onClick={() => { if (!importing) onClose(); }}
              disabled={importing}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 cursor-pointer"
            >
              {importedCount > 0 && !isProcessing && readySelected === 0 ? "关闭" : "取消"}
            </button>
            {(readySelected > 0 || importing) && (
              <button
                onClick={handleImport}
                disabled={importing || isProcessing || readySelected === 0}
                className="px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {importing ? "导入中…" : `导入 ${readySelected} 本`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
