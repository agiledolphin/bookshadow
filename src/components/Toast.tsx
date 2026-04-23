import { useToastStore } from "../stores/toastStore";
import type { ToastType } from "../stores/toastStore";

const COLORS: Record<ToastType, string> = {
  error:   "bg-red-500 text-white",
  success: "bg-green-500 text-white",
  info:    "bg-gray-800 text-white",
};

export function Toast() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm pointer-events-auto max-w-xs ${COLORS[t.type]}`}
        >
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => removeToast(t.id)}
            className="shrink-0 opacity-70 hover:opacity-100 cursor-pointer text-base leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
