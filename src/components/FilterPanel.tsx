import { useState, useMemo } from "react";
import { useBookStore } from "../stores/bookStore";
import { LANGUAGES, PRIMARY_REGIONS, PRIMARY_CATEGORIES, RATINGS, STATUSES } from "../types/book";

export function FilterPanel() {
  const { filters, filterCounts, setFilters } = useBookStore();
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherCategoryOpen, setOtherCategoryOpen] = useState(false);

  const SIDEBAR_KEYS = ["status", "rating", "region", "category", "decade", "language", "tag", "has_review"] as const;
  const update = (key: string, value: string | number | boolean | undefined) => {
    setFilters({ ...filters, [key]: value });
  };
  const clear = () => setFilters({ search_query: filters.search_query, sort_by: filters.sort_by });
  const hasFilters = SIDEBAR_KEYS.some((k) => filters[k] !== undefined);

  const counts = filterCounts ?? {
    total: 0, status: {}, region: {}, category: {}, language: {}, rating: {}, decade: {}, tag: {}, has_review: 0,
  };

  const decades = useMemo(
    () => Object.keys(counts.decade).map(Number).sort((a, b) => b - a),
    [counts.decade],
  );

  const otherRegions = useMemo(() => {
    const primarySet = new Set<string>(PRIMARY_REGIONS);
    const others = Object.keys(counts.region).filter((r) => !primarySet.has(r) && r !== "").sort();
    if ((counts.region[""] ?? 0) > 0) others.push("");
    return others;
  }, [counts.region]);

  const otherCategories = useMemo(() => {
    const primarySet = new Set<string>(PRIMARY_CATEGORIES);
    const others = Object.keys(counts.category).filter((c) => !primarySet.has(c) && c !== "").sort();
    if ((counts.category[""] ?? 0) > 0) others.push("");
    return others;
  }, [counts.category]);

  const activeRegionIsOther =
    filters.region !== undefined &&
    !(PRIMARY_REGIONS as readonly string[]).includes(filters.region);

  const activeCategoryIsOther =
    filters.category !== undefined &&
    !(PRIMARY_CATEGORIES as readonly string[]).includes(filters.category);

  return (
    <aside className="w-36 shrink-0 flex flex-col border-r border-gray-100 bg-white">

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
              {counts.total}
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

      {counts.has_review > 0 && (
        <FilterGroup label="书评">
          <GroupItem
            active={filters.has_review === true}
            count={counts.has_review}
            onClick={() => update("has_review", filters.has_review ? undefined : true)}
          >
            有书评
          </GroupItem>
        </FilterGroup>
      )}

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
                    key={r || "__unset__"}
                    active={filters.region === r}
                    count={counts.region[r] ?? 0}
                    onClick={() => update("region", filters.region === r ? undefined : r)}
                    indent
                  >
                    {r || "未设"}
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
                    key={c || "__unset__"}
                    active={filters.category === c}
                    count={counts.category[c] ?? 0}
                    onClick={() => update("category", filters.category === c ? undefined : c)}
                    indent
                  >
                    {c || "未设"}
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

      {decades.length > 0 && (
        <FilterGroup label="年代">
          {decades.map((d) => (
            <GroupItem
              key={d}
              active={filters.decade === d}
              count={counts.decade[d]}
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
