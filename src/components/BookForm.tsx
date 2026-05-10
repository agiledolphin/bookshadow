import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Book, CreateBook, BookMeta } from "../types/book";
import { useBookStore } from "../stores/bookStore";
import { useToastStore } from "../stores/toastStore";
import { StarRating } from "./StarRating";
import { TagInput } from "./TagInput";
import { SearchableSelect } from "./SearchableSelect";
import { DateInput } from "./DateInput";
import { LANGUAGES, REGIONS, CATEGORIES, STATUSES } from "../types/book";

interface Props {
  book?: Book;
  onClose: () => void;
}

export function BookForm({ book, onClose }: Props) {
  const { createBook, updateBook } = useBookStore();
  const filterCountsTags = useBookStore((s) => s.filterCounts?.tag);
  const allTags = useMemo(
    () => Object.keys(filterCountsTags ?? {}).sort(),
    [filterCountsTags],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const { addToast } = useToastStore();
  const [form, setForm] = useState<CreateBook>({
    title: book?.title ?? "",
    author: book?.author ?? "",
    isbn: book?.isbn ?? "",
    publisher: book?.publisher ?? "",
    pub_date: book?.pub_date,
    language: book?.language ?? "",
    region: book?.region ?? "",
    category: book?.category ?? "",
    tags: book?.tags ?? "[]",
    rating: book?.rating,
    cover_url: book?.cover_url ?? "",
    description: book?.description ?? "",
    translator: book?.translator ?? "",
    status: book?.status,
    started_at: book?.started_at,
    finished_at: book?.finished_at,
    series: book?.series ?? "",
  });
  const [isbnInput, setIsbnInput] = useState(book?.isbn ?? "");
  const [isbnSource, setIsbnSource] = useState<"douban" | "google" | "openlibrary" | "auto">("douban");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const isDoubanUrl = /douban\.com\/subject\/\d+/.test(isbnInput.trim());
  const [saving, setSaving] = useState(false);

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
      setForm((f) => ({
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
        series: meta.series ?? f.series,
      }));
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setFetching(false);
    }
  };

  const set = <K extends keyof CreateBook>(key: K, value: CreateBook[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleStatusClick = (value: string) => {
    setForm((f) => {
      const isActive = f.status === value;
      const newStatus = isActive ? "" : value;
      const today = new Date().toISOString().split("T")[0];
      if (isActive) {
        return {
          ...f,
          status: newStatus,
          started_at:  value === "reading" ? undefined : f.started_at,
          finished_at: value === "read"    ? undefined : f.finished_at,
        };
      }
      switch (value) {
        case "want":
          return { ...f, status: newStatus, started_at: undefined, finished_at: undefined };
        case "reading":
          return { ...f, status: newStatus, started_at: f.started_at ?? today, finished_at: undefined };
        case "read":
          return { ...f, status: newStatus, finished_at: f.finished_at ?? today };
        default:
          return { ...f, status: newStatus };
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (book) {
        await updateBook(book.id, form);
      } else {
        await createBook(form);
      }
      onClose();
    } catch (err) {
      addToast(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* 固定标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h2 className="text-base font-semibold">{book ? "编辑书籍" : "新增书籍"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none cursor-pointer">×</button>
        </div>

        {/* 可滚动表单区 */}
        <form id="book-form" onSubmit={handleSubmit} className="px-5 py-3 flex flex-col gap-3 overflow-y-auto flex-1">
          {/* ISBN / 豆瓣链接 快速填充 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ISBN 或豆瓣链接</label>
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={isbnInput}
                onChange={(e) => setIsbnInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), fetchIsbn())}
                placeholder="ISBN 号码 或 book.douban.com/subject/…"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={fetchIsbn}
                disabled={fetching}
                className="bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
              >
                {fetching ? "获取中…" : "获取"}
              </button>
            </div>
            {isDoubanUrl ? (
              <p className="text-xs text-blue-500 mt-1">检测到豆瓣链接，将直接抓取该页面</p>
            ) : (
              <div className="flex gap-3 mt-1.5">
                {(["douban", "google", "openlibrary", "auto"] as const).map((s) => (
                  <label key={s} className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="isbnSource"
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

          <Field label="书名 *">
            <input
              required
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="作者">
              <input
                value={form.author ?? ""}
                onChange={(e) => set("author", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </Field>
            <Field label="译者">
              <input
                value={form.translator ?? ""}
                onChange={(e) => set("translator", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="出版社">
              <input
                value={form.publisher ?? ""}
                onChange={(e) => set("publisher", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </Field>
            <Field label="出版时间">
              <input
                type="text"
                value={form.pub_date ?? ""}
                onChange={(e) => set("pub_date", e.target.value || undefined)}
                placeholder="如 2024、2024-03、2024-03-15"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="语言">
              <select
                value={form.language ?? ""}
                onChange={(e) => set("language", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">—</option>
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="地域">
              <SearchableSelect
                value={form.region ?? ""}
                onChange={(v) => set("region", v)}
                options={REGIONS}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </Field>
            <Field label="类别">
              <SearchableSelect
                value={form.category ?? ""}
                onChange={(v) => set("category", v)}
                options={CATEGORIES}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </Field>
          </div>

          <Field label="星级">
            <StarRating value={form.rating ?? 0} onChange={(v) => set("rating", v)} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="阅读状态">
              <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm h-[34px]">
                {STATUSES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleStatusClick(value)}
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
            </Field>
            <Field label="开始阅读">
              <DateInput value={form.started_at} onChange={(v) => set("started_at", v)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </Field>
            <Field label="完成阅读">
              <DateInput value={form.finished_at} onChange={(v) => set("finished_at", v)} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </Field>
          </div>

          <Field label="丛书">
            <input
              value={form.series ?? ""}
              onChange={(e) => set("series", e.target.value || undefined)}
              placeholder="丛书或系列名"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </Field>

          <Field label="封面图片 URL">
            <input
              value={form.cover_url ?? ""}
              onChange={(e) => set("cover_url", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </Field>

          <Field label="简介">
            <textarea
              rows={2}
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </Field>

          <Field label="标签">
            <TagInput value={form.tags ?? "[]"} onChange={(v) => set("tags", v)} suggestions={allTags} />
          </Field>
        </form>

        {/* 固定底部按钮 */}
        <div className="flex items-center justify-between px-5 py-3 border-t shrink-0">
          <span className="flex-1" />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              form="book-form"
              disabled={saving}
              className="bg-blue-500 text-white px-6 py-1.5 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
