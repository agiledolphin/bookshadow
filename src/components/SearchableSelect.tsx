import { useState, useRef, useEffect } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  className?: string;
}

export function SearchableSelect({ value, onChange, options, className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? options.filter((o) => o.includes(query.trim()))
    : options;

  // Reset highlight when filter changes
  useEffect(() => { setHighlighted(-1); }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlighted < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLDivElement>("[data-opt]");
    items[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  const select = (opt: string) => {
    onChange(opt);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHighlighted((h) => Math.max(h - 1, -1));
      e.preventDefault();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && filtered[highlighted]) {
        select(filtered[highlighted]);
      } else if (highlighted === -1 && !query) {
        select("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      e.stopPropagation();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={open ? query : value}
        placeholder={open ? (value || "—") : (value || "—")}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onKeyDown={handleKeyDown}
        className={className}
        readOnly={!open}
      />
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 top-full mt-0.5 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {/* Empty / clear option */}
          <div
            data-opt
            onMouseDown={() => select("")}
            className={`px-3 py-1.5 text-sm cursor-pointer text-gray-400 hover:bg-gray-50 ${
              !value && highlighted === -1 ? "bg-blue-50" : ""
            }`}
          >
            —
          </div>
          {filtered.map((opt, i) => (
            <div
              key={opt}
              data-opt
              onMouseDown={() => select(opt)}
              className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 ${
                highlighted === i ? "bg-blue-50" : ""
              } ${opt === value ? "font-medium text-blue-600" : ""}`}
            >
              {opt}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-1.5 text-sm text-gray-400 italic">无匹配</div>
          )}
        </div>
      )}
    </div>
  );
}
