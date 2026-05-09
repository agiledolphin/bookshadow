import { useEffect, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Book, BookMeta, CreateBook } from "../types/book";
import { STATUSES, LANGUAGES, REGIONS, CATEGORIES } from "../types/book";
import { useBookStore } from "../stores/bookStore";
import { useToastStore } from "../stores/toastStore";
import { StarRating } from "./StarRating";
import { TagInput, parseTags } from "./TagInput";
import { ReviewEditor } from "./ReviewEditor";
import { SearchableSelect } from "./SearchableSelect";

function localCoverSrc(path: string, v = 0): string {
  const filename = path.split("/").pop() ?? "";
  return `bookcover://localhost/${filename}${v ? `?v=${v}` : ""}`;
}

interface Props {
  book: Book;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

export function BookDetail({ book, onClose, onPrev, onNext }: Props) {
  // View state
  const [descExpanded, setDescExpanded] = useState(false);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<CreateBook>(makeForm(book));
  const [isbnInput, setIsbnInput] = useState(book.isbn ?? "");
  const [isbnSource, setIsbnSource] = useState<"douban" | "google" | "openlibrary" | "auto">("douban");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const { updateBook, patchBook } = useBookStore();
  const coverLocal = useBookStore(
    (s) => s.books.find((b) => b.id === book.id)?.cover_local ?? book.cover_local
  );
  const coverNonce = useBookStore((s) => s.coverNonce[book.id]);
  const { addToast } = useToastStore();
  const filterCountsTags = useBookStore((s) => s.filterCounts?.tag);
  const allTags = useMemo(
    () => Object.keys(filterCountsTags ?? {}).sort(),
    [filterCountsTags],
  );

  const isDoubanUrl = /douban\.com\/subject\/\d+/.test(isbnInput.trim());

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editMode) setEditMode(false);
        else onClose();
      } else if ((e.key === "e" || e.key === "E") && !editMode) {
        const el = e.target as HTMLElement;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
        setForm(makeForm(book));
        setIsbnInput(book.isbn ?? "");
        setFetchError("");
        setEditMode(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, editMode, book]);

  const enterEditMode = () => {
    setForm(makeForm(book));
    setIsbnInput(book.isbn ?? "");
    setFetchError("");
    setEditMode(true);
  };

  const set = <K extends keyof CreateBook>(key: K, value: CreateBook[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const fetchIsbn = async () => {
    if (!isbnInput.trim()) return;
    setFetching(true);
    setFetchError("");
    try {
      const effectiveSource = isDoubanUrl ? "douban" : (isbnSource === "auto" ? null : isbnSource);
      const meta = await invoke<BookMeta>("fetch_by_isbn", {
        isbn: isbnInput.trim(),
        source: effectiveSource,
      });
      setForm(f => ({
        ...f,
        title: meta.title ?? f.title,
        author: meta.author ?? f.author,
        translator: meta.translator ?? f.translator,
        publisher: meta.publisher ?? f.publisher,
        pub_date: meta.pub_date ?? f.pub_date,
        cover_url: meta.cover_url ?? f.cover_url,
        description: meta.description ?? f.description,
        language: meta.language ?? f.language,
        region: meta.region ?? f.region,
        category: meta.category ?? f.category,
        isbn: meta.isbn ?? (isDoubanUrl ? "" : isbnInput.trim()),
        rating: meta.rating ?? f.rating,
      }));
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setFetching(false);
    }
  };

  const uploadCover = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "webp"] }],
    });
    if (!selected) return;
    setUploadingCover(true);
    try {
      const localPath = await invoke<string>("upload_cover", { id: book.id, srcPath: selected });
      setForm((f) => ({ ...f, cover_url: "" }));
      patchBook(book.id, { cover_local: localPath, cover_url: undefined });
    } catch (err) {
      addToast(String(err));
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await updateBook(book.id, form);
      onClose();
    } catch (err) {
      addToast(String(err));
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = STATUSES.find(s => s.value === book.status)?.label;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b">
          <h2 className="text-lg font-semibold truncate flex-1">{book.title}</h2>
          {!editMode && (onPrev || onNext) && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={onPrev ?? undefined}
                disabled={!onPrev}
                title="上一本 ←"
                className="p-1.5 rounded text-gray-400 hover:text-gray-600 disabled:opacity-25 disabled:cursor-default cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={onNext ?? undefined}
                disabled={!onNext}
                title="下一本 →"
                className="p-1.5 rounded text-gray-400 hover:text-gray-600 disabled:opacity-25 disabled:cursor-default cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
          {editMode ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setEditMode(false)}
                disabled={saving}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="px-4 py-1.5 text-sm font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          ) : (
            <button
              onClick={enterEditMode}
              title="编辑"
              className="shrink-0 p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {editMode ? (
            <div className="p-5 flex gap-6">
              {/* Cover — reference while editing */}
              <div className="w-32 shrink-0">
                <div className="aspect-[2/3] bg-gray-100 rounded-lg overflow-hidden">
                  {coverLocal ? (
                    <img src={localCoverSrc(coverLocal!, coverNonce)} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-3xl">📚</div>
                  )}
                </div>
                <button
                  onClick={uploadCover}
                  disabled={uploadingCover}
                  className="mt-1.5 w-full text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded py-1 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {uploadingCover ? "上传中…" : "上传封面"}
                </button>
              </div>

              {/* Form fields */}
              <div className="flex-1 min-w-0 flex flex-col gap-3">
                {/* ISBN / 豆瓣链接 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ISBN 或豆瓣链接</label>
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={isbnInput}
                      onChange={e => setIsbnInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), fetchIsbn())}
                      placeholder="ISBN 号码 或 book.douban.com/subject/…"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <button
                      type="button"
                      onClick={fetchIsbn}
                      disabled={fetching}
                      className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {fetching ? "获取中…" : "获取"}
                    </button>
                  </div>
                  {isDoubanUrl ? (
                    <p className="text-xs text-blue-500 mt-1">检测到豆瓣链接，将直接抓取该页面</p>
                  ) : (
                    <div className="flex gap-3 mt-1.5">
                      {(["douban", "google", "openlibrary", "auto"] as const).map(s => (
                        <label key={s} className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
                          <input
                            type="radio"
                            name="editIsbnSource"
                            value={s}
                            checked={isbnSource === s}
                            onChange={() => setIsbnSource(s)}
                            className="accent-blue-500"
                          />
                          {s === "auto" ? "自动" : s === "douban" ? "豆瓣" : s === "google" ? "Google Books" : "Open Library"}
                        </label>
                      ))}
                    </div>
                  )}
                  {fetchError && <p className="text-xs text-red-500 mt-1">{fetchError}</p>}
                </div>

                {/* 书名 */}
                <FormField label="书名 *">
                  <input
                    required
                    value={form.title}
                    onChange={e => set("title", e.target.value)}
                    className={inputCls}
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="作者">
                    <input value={form.author ?? ""} onChange={e => set("author", e.target.value)} className={inputCls} />
                  </FormField>
                  <FormField label="译者">
                    <input value={form.translator ?? ""} onChange={e => set("translator", e.target.value)} className={inputCls} />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="出版社">
                    <input value={form.publisher ?? ""} onChange={e => set("publisher", e.target.value)} className={inputCls} />
                  </FormField>
                  <FormField label="出版时间">
                    <input
                      value={form.pub_date ?? ""}
                      onChange={e => set("pub_date", e.target.value || undefined)}
                      placeholder="如 2024、2024-03"
                      className={inputCls}
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <FormField label="语言">
                    <select value={form.language ?? ""} onChange={e => set("language", e.target.value)} className={inputCls}>
                      <option value="">—</option>
                      {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                    </select>
                  </FormField>
                  <FormField label="地域">
                    <SearchableSelect
                      value={form.region ?? ""}
                      onChange={(v) => set("region", v)}
                      options={REGIONS}
                      className={inputCls}
                    />
                  </FormField>
                  <FormField label="类别">
                    <SearchableSelect
                      value={form.category ?? ""}
                      onChange={(v) => set("category", v)}
                      options={CATEGORIES}
                      className={inputCls}
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="星级">
                    <StarRating value={form.rating ?? 0} onChange={v => set("rating", v)} />
                  </FormField>
                  <FormField label="阅读状态">
                    <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm h-[34px]">
                      {STATUSES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => set("status", form.status === value ? "" : value)}
                          className={`flex-1 cursor-pointer transition-colors ${
                            form.status === value && (form.status as string) !== ""
                              ? value === "want" ? "bg-yellow-100 text-yellow-700 font-medium"
                              : value === "reading" ? "bg-blue-100 text-blue-700 font-medium"
                              : "bg-green-100 text-green-700 font-medium"
                              : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </FormField>
                </div>

                <FormField label="封面图片 URL">
                  <input value={form.cover_url ?? ""} onChange={e => set("cover_url", e.target.value)} className={inputCls} />
                </FormField>

                <FormField label="简介">
                  <textarea
                    rows={3}
                    value={form.description ?? ""}
                    onChange={e => set("description", e.target.value)}
                    className={`${inputCls} resize-none`}
                  />
                </FormField>

                <FormField label="标签">
                  <TagInput value={form.tags ?? "[]"} onChange={v => set("tags", v)} suggestions={allTags} />
                </FormField>
              </div>
            </div>
          ) : (
            <div className="p-5 flex gap-6">
              {/* Cover */}
              <div className="w-32 shrink-0">
                <div className="aspect-[2/3] bg-gray-100 rounded-lg overflow-hidden">
                  {coverLocal ? (
                    <img
                      key={`${coverLocal}-${coverNonce}`}
                      src={localCoverSrc(coverLocal!, coverNonce)}
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
                {(() => {
                  const tags = parseTags(book.tags ?? "[]");
                  return tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span key={tag} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null;
                })()}
                {book.description && (
                  <div className="mt-3">
                    <p className={`text-sm text-gray-600 leading-relaxed ${descExpanded ? "" : "line-clamp-4"}`}>
                      {book.description}
                    </p>
                    <button
                      onClick={() => setDescExpanded(v => !v)}
                      className="mt-1 text-xs text-blue-500 hover:text-blue-700 cursor-pointer"
                    >
                      {descExpanded ? "收起" : "展开"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="border-t">
            <ReviewEditor bookId={book.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";

function makeForm(book: Book): CreateBook {
  return {
    title: book.title,
    author: book.author ?? "",
    isbn: book.isbn ?? "",
    publisher: book.publisher ?? "",
    pub_date: book.pub_date,
    language: book.language ?? "",
    region: book.region ?? "",
    category: book.category ?? "",
    tags: book.tags ?? "[]",
    rating: book.rating,
    cover_url: book.cover_url ?? "",
    description: book.description ?? "",
    translator: book.translator ?? "",
    status: book.status,
  };
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
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
