import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useBookStore } from "./bookStore";
import { useToastStore } from "./toastStore";

interface RefreshProgress {
  done: number;
  total: number;
  title: string;
  updated: number;
}

interface RefreshSummary {
  total: number;
  updated: number;
  failed: number;
  cancelled: boolean;
  douban_error: string | null;
}

interface RatingsRefreshStore {
  running: boolean;
  cancelling: boolean;
  progress: RefreshProgress | null;
  start: (onlyMissing: boolean) => Promise<void>;
  cancel: () => Promise<void>;
}

// 状态放在全局 store：设置面板关闭后任务仍在后台运行，重新打开可继续看到进度
export const useRatingsRefreshStore = create<RatingsRefreshStore>((set, get) => ({
  running: false,
  cancelling: false,
  progress: null,

  start: async (onlyMissing) => {
    if (get().running) return;
    set({ running: true, cancelling: false, progress: null });
    const { addToast } = useToastStore.getState();
    const unlisten = await listen<RefreshProgress>("ratings_refresh_progress", (e) => {
      set({ progress: e.payload });
    });
    try {
      const s = await invoke<RefreshSummary>("refresh_community_ratings", { onlyMissing });
      if (s.total === 0) {
        addToast("没有需要回填评分的书", "info");
      } else {
        const head = s.cancelled ? "已取消" : "评分回填完成";
        const failed = s.failed > 0 ? `，${s.failed} 本未找到或失败` : "";
        addToast(`${head}：更新 ${s.updated} 本${failed}`, "success");
      }
      if (s.douban_error) addToast(`${s.douban_error}（已跳过豆瓣，仅查询 Goodreads）`);
      if (s.updated > 0) useBookStore.getState().fetchBooks();
    } catch (e) {
      addToast(String(e));
    } finally {
      unlisten();
      set({ running: false, cancelling: false });
    }
  },

  cancel: async () => {
    set({ cancelling: true });
    await invoke("cancel_refresh_ratings").catch(() => {});
  },
}));
