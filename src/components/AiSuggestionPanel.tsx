import type { MetadataSuggestion } from "../types/book";

interface Props {
  suggestion: MetadataSuggestion;
  currentCategory: string;
  currentRegion: string;
  currentTags: string[];
  onAdoptCategory: (v: string) => void;
  onAdoptRegion: (v: string) => void;
  onAdoptTag: (tag: string) => void;
  onDismiss: () => void;
}

export function AiSuggestionPanel({
  suggestion,
  currentCategory,
  currentRegion,
  currentTags,
  onAdoptCategory,
  onAdoptRegion,
  onAdoptTag,
  onDismiss,
}: Props) {
  if (!suggestion.category && !suggestion.region && suggestion.tags.length === 0) return null;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex flex-col gap-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-purple-700">✦ AI 建议</span>
        <button type="button" onClick={onDismiss} className="text-gray-400 hover:text-gray-600 cursor-pointer leading-none text-sm">×</button>
      </div>

      {suggestion.category && (
        <SuggestionRow
          label="类别"
          value={suggestion.category}
          adopted={currentCategory === suggestion.category}
          onAdopt={() => onAdoptCategory(suggestion.category!)}
        />
      )}
      {suggestion.region && (
        <SuggestionRow
          label="地域"
          value={suggestion.region}
          adopted={currentRegion === suggestion.region}
          onAdopt={() => onAdoptRegion(suggestion.region!)}
        />
      )}
      {suggestion.tags.length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-gray-400 w-8 shrink-0 pt-0.5">标签</span>
          <div className="flex flex-wrap gap-1">
            {suggestion.tags.map((tag) => {
              const adopted = currentTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => !adopted && onAdoptTag(tag)}
                  disabled={adopted}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    adopted
                      ? "bg-green-100 text-green-700 cursor-default"
                      : "bg-purple-100 text-purple-700 hover:bg-purple-200 cursor-pointer"
                  }`}
                >
                  {adopted ? `✓ ${tag}` : `+ ${tag}`}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  label,
  value,
  adopted,
  onAdopt,
}: {
  label: string;
  value: string;
  adopted: boolean;
  onAdopt: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400 w-8 shrink-0">{label}</span>
      <span className="text-gray-700">{value}</span>
      {adopted ? (
        <span className="ml-auto text-green-600">✓ 已采用</span>
      ) : (
        <button
          type="button"
          onClick={onAdopt}
          className="ml-auto px-2 py-0.5 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 cursor-pointer transition-colors"
        >
          采用
        </button>
      )}
    </div>
  );
}
