import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { useToastStore } from "../stores/toastStore";

interface AppConfig {
  google_books_api_key?: string;
  douban_cookie?: string;
  anthropic_api_key?: string;
  llm_base_url?: string;
  llm_model?: string;
}

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [config, setConfig] = useState<AppConfig>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showCookie, setShowCookie] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const { addToast } = useToastStore();

  useEffect(() => {
    invoke<AppConfig>("get_config").then(setConfig).catch(() => {});
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);

    let unlistenUpdated: (() => void) | undefined;
    let unlistenClosed: (() => void) | undefined;

    listen<void>("douban-cookie-updated", () => {
      invoke<AppConfig>("get_config").then((cfg) => {
        setConfig(cfg);
        addToast("豆瓣 Cookie 已自动保存");
      }).catch(() => {}).finally(() => setLoggingIn(false));
    }).then((fn) => { unlistenUpdated = fn; });

    listen<void>("douban-login-closed", () => {
      setLoggingIn(false);
      addToast("Cookie 未自动提取，可手动粘贴至输入框");
    }).then((fn) => { unlistenClosed = fn; });

    return () => {
      window.removeEventListener("keydown", handler);
      unlistenUpdated?.();
      unlistenClosed?.();
    };
  }, [onClose]);

  const handleExport = async (format: "json" | "csv") => {
    const path = await save({
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
      defaultPath: `bookshadow_export.${format}`,
    });
    if (!path) return;
    try {
      await invoke("export_books", { path, format });
      addToast(`已导出 ${format.toUpperCase()}`);
    } catch (err) {
      addToast(String(err));
    }
  };

  const handleDoubanLogin = async () => {
    setLoggingIn(true);
    try {
      await invoke("open_douban_login");
    } catch (e) {
      setLoggingIn(false);
      addToast(String(e));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke("save_config", { config });
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 800);
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">设置</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Google Books API Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={config.google_books_api_key ?? ""}
                onChange={(e) => setConfig({ ...config, google_books_api_key: e.target.value || undefined })}
                placeholder="AIza..."
                className="w-full px-3 py-2 pr-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                title={showKey ? "隐藏" : "显示"}
              >
                {showKey ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              留空则使用匿名访问（可能受频率限制）。可在{" "}
              <span className="text-blue-500">Google Cloud Console</span>{" "}
              免费申请，每日 1000 次。
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">豆瓣 Cookie</label>
            <div className="relative">
              <input
                type={showCookie ? "text" : "password"}
                value={config.douban_cookie ?? ""}
                onChange={(e) => setConfig({ ...config, douban_cookie: e.target.value || undefined })}
                placeholder="bid=...; dbcl2=..."
                className="w-full px-3 py-2 pr-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowCookie((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                title={showCookie ? "隐藏" : "显示"}
              >
                {showCookie ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              浏览器登录豆瓣后，打开开发者工具 → Network → 任意请求 → Headers → Cookie，复制完整值粘贴此处。
            </p>
            <button
              type="button"
              onClick={handleDoubanLogin}
              disabled={loggingIn}
              className="mt-0.5 self-start px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {loggingIn ? "等待登录中…" : "打开豆瓣登录窗口（自动提取）"}
            </button>
          </div>
          <div className="border-t border-gray-100 pt-5 flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Anthropic API Key</label>
            <div className="relative">
              <input
                type={showAnthropicKey ? "text" : "password"}
                value={config.anthropic_api_key ?? ""}
                onChange={(e) => setConfig({ ...config, anthropic_api_key: e.target.value || undefined })}
                placeholder="sk-ant-..."
                className="w-full px-3 py-2 pr-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowAnthropicKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                title={showAnthropicKey ? "隐藏" : "显示"}
              >
                {showAnthropicKey ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-400">用于书籍推荐与元数据补全（AI 建议）。可在 Anthropic Console 申请。</p>
            <input
              type="text"
              value={config.llm_base_url ?? ""}
              onChange={(e) => setConfig({ ...config, llm_base_url: e.target.value || undefined })}
              placeholder="自定义 API 地址（留空使用官方）"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
            />
            <input
              type="text"
              value={config.llm_model ?? ""}
              onChange={(e) => setConfig({ ...config, llm_model: e.target.value || undefined })}
              placeholder="模型名称（留空用 claude-sonnet-4-6）"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
            />
          </div>

          <div className="border-t border-gray-100 pt-5 flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">数据导出</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport("json")}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                导出 JSON
              </button>
              <button
                onClick={() => handleExport("csv")}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                导出 CSV
              </button>
            </div>
            <p className="text-xs text-gray-400">导出全部书籍数据，JSON 包含所有字段，CSV 适合在表格软件中查看。</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {saved ? "已保存" : saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
