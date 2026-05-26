import { useState } from "react";
import type { ReadingStats } from "../types/book";

type Tab = "trend" | "category" | "region" | "author";

const SLOT_W = 28;  // px per year on time axis
const BAR_H = 220;

export function StatsPanel({ stats }: { stats: ReadingStats }) {
  const { status_counts, yearly, by_category, by_region, by_author } = stats;
  const [tab, setTab] = useState<Tab>("trend");

  const sortWithUnset = (arr: { label: string; count: number }[]) => [
    ...arr.filter((x) => x.label !== ""),
    ...arr.filter((x) => x.label === ""),
  ];

  const currentYear = new Date().getFullYear();
  // Only years with actual data — no gap-filling
  const yearlyData = yearly.map((y) => ({ year: y.year, value: y.count }));
  const categoryData = sortWithUnset(by_category.map((c) => ({ label: c.label, count: c.count })));
  const regionData   = sortWithUnset(by_region.map((r) => ({ label: r.label, count: r.count })));
  const authorData   = by_author.map((a) => ({ label: a.label, count: a.count }));

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-2xl mx-auto px-6 pt-6 space-y-6">
        <div className="flex gap-3">
          <KpiCard label="总藏书" value={status_counts.total}   color="text-gray-700" />
          <KpiCard label="已读"   value={status_counts.read}    color="text-green-500" />
          <KpiCard label="在读"   value={status_counts.reading} color="text-blue-500" />
          <KpiCard label="想读"   value={status_counts.want}    color="text-amber-500" />
          {status_counts.tobuy > 0 && (
            <KpiCard label="待购" value={status_counts.tobuy} color="text-orange-500" />
          )}
        </div>

        <div className="flex border-b border-gray-100">
          {([["trend", "阅读趋势"], ["category", "类别分布"], ["region", "地域分布"], ["author", "作者榜"]] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm cursor-pointer transition-colors border-b-2 -mb-px ${
                tab === key
                  ? "border-blue-500 text-blue-600 font-medium"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={tab === "trend" ? "px-6 pb-6 pt-5" : "max-w-2xl mx-auto px-6 pb-6 pt-5"}>
        {tab === "trend" && (
          yearlyData.length > 0
            ? <TrendChart data={yearlyData} currentYear={currentYear} />
            : <Empty text="暂无完成阅读记录，填写「完成阅读」日期后显示" />
        )}
        {tab === "category" && (
          categoryData.length > 0
            ? <HorizontalBarChart data={categoryData} color="bg-indigo-400" />
            : <Empty text="暂无数据" />
        )}
        {tab === "region" && (
          regionData.length > 0
            ? <HorizontalBarChart data={regionData} color="bg-teal-400" />
            : <Empty text="暂无数据" />
        )}
        {tab === "author" && (
          authorData.length > 0
            ? <HorizontalBarChart data={authorData} color="bg-violet-400" labelWidth="w-24" />
            : <Empty text="暂无数据" />
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 bg-gray-50 rounded-xl px-4 py-3 flex flex-col items-center gap-0.5">
      <span className={`text-3xl font-light tabular-nums ${color}`}>{value}</span>
      <span className="text-[11px] text-gray-400">{label}</span>
    </div>
  );
}

function TrendChart({
  data,
  currentYear,
}: {
  data: { year: number; value: number }[];
  currentYear: number;
}) {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  if (data.length === 0) return null;

  const minYear = data[0].year;
  const maxYear = data[data.length - 1].year;
  const spanYears = maxYear - minYear + 1;
  const totalW = spanYears * SLOT_W;

  const LABEL_H = 20;
  const COUNT_H = 16;
  const BAR_AREA = BAR_H - LABEL_H - COUNT_H;
  const max = Math.max(...data.map((d) => d.value), 1);

  const GAP = Math.max(2, SLOT_W * 0.15);
  const barW = SLOT_W - GAP * 2;

  // 5-year grid lines
  const firstGrid = Math.ceil(minYear / 5) * 5;
  const gridYears: number[] = [];
  for (let y = firstGrid; y <= maxYear; y += 5) gridYears.push(y);

  const cx = (year: number) => (year - minYear) * SLOT_W + SLOT_W / 2;

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "table", margin: "0 auto" }}>
        <svg viewBox={`0 0 ${totalW} ${BAR_H}`} style={{ width: totalW, height: BAR_H, display: "block" }}>

          {/* 5-year grid lines + labels */}
          {gridYears.map((y) => {
            const gx = (y - minYear) * SLOT_W;
            return (
              <g key={`grid-${y}`}>
                <line x1={gx} y1={COUNT_H} x2={gx} y2={COUNT_H + BAR_AREA} stroke="#F3F4F6" strokeWidth={1} />
                <text x={gx + 2} y={BAR_H - 4} fill="#9CA3AF" fontSize={10}>
                  {y}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((d) => {
            const barH = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * BAR_AREA);
            const x = cx(d.year) - barW / 2;
            const y = COUNT_H + BAR_AREA - barH;
            const isHighlight = d.year === currentYear;
            const isHovered = hoveredYear === d.year;


            return (
              <g
                key={d.year}
                onMouseEnter={() => setHoveredYear(d.year)}
                onMouseLeave={() => setHoveredYear(null)}
                style={{ cursor: "default" }}
              >
                {/* transparent hit area */}
                <rect x={x} y={COUNT_H} width={barW} height={BAR_AREA} fill="transparent" />

                {/* count label — always shown */}
                {d.value > 0 && (
                  <text x={cx(d.year)} y={y - 3} textAnchor="middle" fill={isHovered ? "#60A5FA" : "#9CA3AF"} fontSize={10} fontWeight={isHovered ? "600" : "400"}>
                    {d.value}
                  </text>
                )}

                {/* bar */}
                <rect
                  x={x} y={y} width={barW} height={barH} rx={2}
                  fill={isHighlight ? (isHovered ? "#3B82F6" : "#60A5FA") : (isHovered ? "#93C5FD" : "#BFDBFE")}
                />

                {/* year label at bottom — blue bold on hover */}
                {isHovered && (
                  <text x={cx(d.year)} y={BAR_H - 4} textAnchor="middle" fill="#3B82F6" fontSize={10} fontWeight="600">
                    {d.year}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function HorizontalBarChart({
  data,
  color = "bg-blue-400",
  labelWidth = "w-16",
}: {
  data: { label: string; count: number }[];
  color?: string;
  labelWidth?: string;
}) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const pct = (d.count / max) * 100;
        const pctOfTotal = total > 0 ? Math.round((d.count / total) * 100) : 0;
        const isUnset = d.label === "";
        return (
          <div key={d.label || "__unset__"} className="flex items-center gap-3">
            <span
              className={`${labelWidth} text-right shrink-0 truncate text-xs ${isUnset ? "text-gray-300" : "text-gray-500"}`}
              title={d.label || "未设"}
            >
              {d.label || "未设"}
            </span>
            <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isUnset ? "bg-gray-200" : color}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`w-6 text-right tabular-nums text-xs shrink-0 ${isUnset ? "text-gray-300" : "text-gray-500"}`}>
              {d.count}
            </span>
            <span className={`w-8 text-right tabular-nums text-xs shrink-0 ${isUnset ? "text-gray-200" : "text-gray-300"}`}>
              {pctOfTotal}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-32 text-xs text-gray-300">{text}</div>
  );
}
