import { useState, useMemo } from "react";
import { useBookStore } from "../stores/bookStore";
import { LANGUAGES, PRIMARY_REGIONS, PRIMARY_CATEGORIES, RATINGS, STATUSES } from "../types/book";
import type { Book, BookFilters } from "../types/book";
import { parseTags } from "./TagInput";

function matchesFilters(book: Book, f: BookFilters): boolean {
  if (f.status   !== undefined && book.status   !== f.status)   return false;
  if (f.region   !== undefined && book.region   !== f.region)   return false;
  if (f.category !== undefined && book.category !== f.category) return false;
  if (f.language !== undefined && book.language !== f.language) return false;
  if (f.rating   !== undefined && (book.rating ?? 0) < f.rating) return false;
  if (f.decade   !== undefined) {
    const y = parseInt(book.pub_date?.slice(0, 4) ?? "");
    if (isNaN(y) || Math.floor(y / 10) * 10 !== f.decade) return false;
  }
  if (f.tag !== undefined) {
    if (!parseTags(book.tags ?? "[]").includes(f.tag)) return false;
  }
  return true;
}

export function FilterPanel() {
  const { filters, setFilters, allBooks } = useBookStore();
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherCategoryOpen, setOtherCategoryOpen] = useState(false);

  const update = (key: string, value: string | number | undefined) => {
    setFilters({ ...filters, [key]: value });
  };
  const clear = () => setFilters({});
  const hasFilters = Object.values(filters).some((v) => v !== undefined);

  const otherRegions = useMemo(() => {
    const primarySet = new Set<string>(PRIMARY_REGIONS);
    const seen = new Set<string>();
    for (const b of allBooks) {
      if (b.region && !primarySet.has(b.region)) seen.add(b.region);
    }
    return Array.from(seen).sort();
  }, [allBooks]);

  const otherCategories = useMemo(() => {
    const primarySet = new Set<string>(PRIMARY_CATEGORIES);
    const seen = new Set<string>();
    for (const b of allBooks) {
      if (b.category && !primarySet.has(b.category)) seen.add(b.category);
    }
    return Array.from(seen).sort();
  }, [allBooks]);

  // 联动计数：每个维度的数字只统计满足"其他所有已选条件"的书籍
  const counts = useMemo(() => {
    const region: Record<string, number> = {};
    const category: Record<string, number> = {};
    const language: Record<string, number> = {};
    const rating: Record<number, number> = {};
    const status: Record<string, number> = {};
    const tag: Record<string, number> = {};
    const decadeSet = new Set<number>();

    for (const b of allBooks) {
      const ex = (dim: keyof BookFilters) => matchesFilters(b, { ...filters, [dim]: undefined });

      if (ex("status")   && b.status)   status[b.status]     = (status[b.status]     ?? 0) + 1;
      if (ex("region")   && b.region)   region[b.region]     = (region[b.region]     ?? 0) + 1;
      if (ex("category") && b.category) category[b.category] = (category[b.category] ?? 0) + 1;
      if (ex("language") && b.language) language[b.language] = (language[b.language] ?? 0) + 1;
      if (ex("rating")   && b.rating) {
        for (let r = 1; r <= b.rating; r++) rating[r] = (rating[r] ?? 0) + 1;
      }
      if (ex("tag")) {
        for (const t of parseTags(b.tags ?? "[]")) tag[t] = (tag[t] ?? 0) + 1;
      }
      if (ex("decade") && b.pub_date) {
        const y = parseInt(b.pub_date.slice(0, 4));
        if (!isNaN(y)) decadeSet.add(Math.floor(y / 10) * 10);
      }
    }
    const decades = Array.from(decadeSet).sort((a, b) => b - a);
    return { region, category, language, rating, status, tag, decades };
  }, [allBooks, filters]);

  const activeRegionIsOther =
    filters.region !== undefined &&
    !(PRIMARY_REGIONS as readonly string[]).includes(filters.region);

  const activeCategoryIsOther =
    filters.category !== undefined &&
    !(PRIMARY_CATEGORIES as readonly string[]).includes(filters.category);

  return (
    <aside className="w-36 shrink-0 flex flex-col border-r border-gray-100 bg-white">
      {/* Traffic-light drag region + brand */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-center gap-2.5 px-2 pt-9 pb-3 border-b border-gray-100 shrink-0 cursor-default select-none"
      >
        {/* Left: icon + 书影 */}
        <div className="flex flex-col items-center gap-1 leading-none">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6.5C2 5.12 3.12 4 4.5 4H12v16H4.5A2.5 2.5 0 0 1 2 17.5v-11Z" />
            <path d="M12 4h7.5C20.88 4 22 5.12 22 6.5v11A2.5 2.5 0 0 1 19.5 20H12V4Z" />
            <path d="M12 4v16" />
          </svg>
          <span className="text-[11px] font-bold tracking-[0.18em] text-gray-800">书影</span>
        </div>
        {/* Right: BOOK / SHADOW */}
        <div className="flex flex-col leading-none gap-0.5">
          <span className="text-[11px] font-light tracking-[0.22em] text-gray-800 uppercase">BOOK</span>
          <span className="text-[11px] font-bold tracking-[0.1em] text-gray-800 uppercase">SHADOW</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="px-2.5 pt-4 pb-1">
        <div className="rounded-xl border border-gray-100 overflow-hidden bg-gray-50">
          <button
            onClick={clear}
            className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors duration-100 cursor-pointer ${
              !hasFilters ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            }`}
          >
            <span>全部</span>
            <span className={`ml-2 shrink-0 text-[10px] tabular-nums ${!hasFilters ? "text-blue-400" : "text-gray-400"}`}>
              {allBooks.length}
            </span>
          </button>
        </div>
      </div>

      <FilterGroup label="状态">
        {STATUSES.map(({ value, label }) => (
          <GroupItem
            key={value}
            active={filters.status === value}
            count={counts.status[value] ?? 0}
            onClick={() => update("status", filters.status === value ? undefined : value)}
          >
            {label}
          </GroupItem>
        ))}
      </FilterGroup>

      <FilterGroup label="星级">
        {[...RATINGS].reverse().map((r) => (
          <StarChip
            key={r}
            stars={r}
            active={filters.rating === r}
            onClick={() => update("rating", filters.rating === r ? undefined : r)}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="地域">
        {PRIMARY_REGIONS.map((r) => (
          <GroupItem
            key={r}
            active={filters.region === r}
            count={counts.region[r] ?? 0}
            onClick={() => update("region", filters.region === r ? undefined : r)}
          >
            {r}
          </GroupItem>
        ))}

        {(otherRegions.length > 0 || activeRegionIsOther) && (
          <div>
            <button
              onClick={() => setOtherOpen((o) => !o)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                activeRegionIsOther
                  ? "bg-blue-100 text-blue-700 font-medium"
                  : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              }`}
            >
              <span>其他</span>
              <span className="text-[10px]">{otherOpen ? "▴" : "▾"}</span>
            </button>

            {otherOpen && otherRegions.length > 0 && (
              <div className="bg-gray-50 border-t border-gray-100">
                {otherRegions.map((r) => (
                  <GroupItem
                    key={r}
                    active={filters.region === r}
                    count={counts.region[r] ?? 0}
                    onClick={() => update("region", filters.region === r ? undefined : r)}
                    indent
                  >
                    {r}
                  </GroupItem>
                ))}
              </div>
            )}
          </div>
        )}
      </FilterGroup>

      <FilterGroup label="类别">
        {PRIMARY_CATEGORIES.map((c) => (
          <GroupItem
            key={c}
            active={filters.category === c}
            count={counts.category[c] ?? 0}
            onClick={() => update("category", filters.category === c ? undefined : c)}
          >
            {c}
          </GroupItem>
        ))}

        {(otherCategories.length > 0 || activeCategoryIsOther) && (
          <div>
            <button
              onClick={() => setOtherCategoryOpen((o) => !o)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors cursor-pointer ${
                activeCategoryIsOther
                  ? "bg-blue-100 text-blue-700 font-medium"
                  : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              }`}
            >
              <span>其他</span>
              <span className="text-[10px]">{otherCategoryOpen ? "▴" : "▾"}</span>
            </button>

            {otherCategoryOpen && otherCategories.length > 0 && (
              <div className="bg-gray-50 border-t border-gray-100">
                {otherCategories.map((c) => (
                  <GroupItem
                    key={c}
                    active={filters.category === c}
                    count={counts.category[c] ?? 0}
                    onClick={() => update("category", filters.category === c ? undefined : c)}
                    indent
                  >
                    {c}
                  </GroupItem>
                ))}
              </div>
            )}
          </div>
        )}
      </FilterGroup>

      <FilterGroup label="语言">
        {LANGUAGES.map((l) => (
          <GroupItem
            key={l}
            active={filters.language === l}
            count={counts.language[l] ?? 0}
            onClick={() => update("language", filters.language === l ? undefined : l)}
          >
            {l}
          </GroupItem>
        ))}
      </FilterGroup>

      {counts.decades.length > 0 && (
        <FilterGroup label="年代">
          {counts.decades.map((d) => (
            <GroupItem
              key={d}
              active={filters.decade === d}
              onClick={() => update("decade", filters.decade === d ? undefined : d)}
            >
              {d}s
            </GroupItem>
          ))}
        </FilterGroup>
      )}

      {Object.keys(counts.tag).length > 0 && (
        <FilterGroup label="标签">
          {Object.entries(counts.tag)
            .sort((a, b) => b[1] - a[1])
            .map(([tag, count]) => (
              <GroupItem
                key={tag}
                active={filters.tag === tag}
                count={count}
                onClick={() => update("tag", filters.tag === tag ? undefined : tag)}
              >
                {tag}
              </GroupItem>
            ))}
        </FilterGroup>
      )}

      </div>
    </aside>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-4 pb-1">
      <p className="text-[9px] font-semibold text-gray-300 uppercase tracking-[0.2em] mb-1.5 px-0.5">
        {label}
      </p>
      <div className="rounded-xl border border-gray-100 overflow-hidden bg-gray-50 divide-y divide-gray-100">
        {children}
      </div>
    </div>
  );
}

function GroupItem({
  active,
  onClick,
  children,
  indent,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  indent?: boolean;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left py-1.5 text-xs flex items-center justify-between transition-colors duration-100 cursor-pointer ${
        indent ? "px-4" : "px-3"
      } ${active ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
    >
      <span className="truncate">{children}</span>
      {count !== undefined && count > 0 && (
        <span className={`ml-2 shrink-0 text-[10px] tabular-nums ${active ? "text-blue-400" : "text-gray-400"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function StarChip({ stars, active, onClick }: { stars: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center transition-colors duration-100 cursor-pointer tracking-tighter ${
        active ? "bg-blue-100" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      }`}
    >
      <span className={active ? "text-amber-500" : "text-amber-400"}>{"★".repeat(stars)}</span>
    </button>
  );
}
