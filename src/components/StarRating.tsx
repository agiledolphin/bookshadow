interface Props {
  value?: number;
  onChange?: (v: number) => void;
  readonly?: boolean;
}

export function StarRating({ value = 0, onChange, readonly }: Props) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n === value ? 0 : n)}
          className={`text-lg leading-none transition-colors ${
            n <= value ? "text-amber-400" : "text-gray-300"
          } ${readonly ? "cursor-default" : "hover:text-amber-300 cursor-pointer"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
