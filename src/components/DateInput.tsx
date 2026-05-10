import { useRef } from "react";
import { Calendar } from "lucide-react";

interface Props {
  value?: string;
  onChange: (v: string | undefined) => void;
  className?: string;
}

export function DateInput({ value, onChange, className }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder="YYYY-MM-DD"
        className={`${className ?? ""} pr-8`}
      />
      <span className="absolute right-2 text-gray-400 pointer-events-none">
        <Calendar className="w-3.5 h-3.5" />
      </span>
      {/* 透明 date input 覆盖图标区域，点击打开原生日历 */}
      <input
        ref={pickerRef}
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="absolute right-0 w-8 h-full opacity-0 cursor-pointer"
        tabIndex={-1}
      />
    </div>
  );
}
