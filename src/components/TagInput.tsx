import { useRef, useState, useMemo, useEffect } from "react";

interface Props {
  value: string; // JSON array string
  onChange: (value: string) => void;
  suggestions?: string[]; // all known tags from the library
}

export function parseTags(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function TagInput({ value, onChange, suggestions = [] }: Props) {
  const [input, setInput] = useState("");
  const [hiIdx, setHiIdx] = useState(-1);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const tags = parseTags(value);

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return suggestions.filter(
      (s) => s.toLowerCase().startsWith(q) && !tags.includes(s)
    );
  }, [input, suggestions, tags]);

  const showDropdown = filtered.length > 0;

  useEffect(() => {
    if (showDropdown && containerRef.current) {
      setDropdownRect(containerRef.current.getBoundingClientRect());
    }
  }, [showDropdown, input]);

  useEffect(() => {
    if (hiIdx < 0 || !listRef.current) return;
    const item = listRef.current.children[hiIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [hiIdx]);

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag || tags.includes(tag)) { setInput(""); setHiIdx(-1); return; }
    onChange(JSON.stringify([...tags, tag]));
    setInput("");
    setHiIdx(-1);
  };

  const removeTag = (tag: string) => {
    onChange(JSON.stringify(tags.filter((t) => t !== tag)));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHiIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHiIdx((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(hiIdx >= 0 && filtered[hiIdx] ? filtered[hiIdx] : input);
    } else if (e.key === "Escape") {
      setInput("");
      setHiIdx(-1);
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap gap-1.5 min-h-[34px] px-2 py-1.5 border border-gray-300 rounded-lg cursor-text focus-within:ring-2 focus-within:ring-blue-400"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full shrink-0">
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="text-blue-400 hover:text-blue-600 leading-none cursor-pointer"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setHiIdx(-1); }}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) addTag(input); }}
          placeholder={tags.length === 0 ? "输入后按 Enter 添加…" : ""}
          className="flex-1 min-w-[80px] text-sm outline-none bg-transparent"
        />
      </div>

      {showDropdown && dropdownRect && (
        <ul
          ref={listRef}
          className="bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] overflow-y-auto"
          style={{
            position: "fixed",
            top: dropdownRect.bottom + 4,
            left: dropdownRect.left,
            width: dropdownRect.width,
            maxHeight: "calc(3 * 2.25rem)",
          }}
        >
          {filtered.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer ${
                  i === hiIdx ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
