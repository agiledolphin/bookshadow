export interface Book {
  id: number;
  title: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  pub_date?: string;
  language?: string;
  region?: string;
  category?: string;
  tags?: string;
  rating?: number;
  cover_url?: string;
  cover_local?: string;
  description?: string;
  translator?: string;
  created_at: string;
  updated_at: string;
  status?: string;
}

export interface Review {
  id: number;
  book_id: number;
  content: string;
  reviewed_at: string;
  created_at: string;
  updated_at: string;
}

export interface BookMeta {
  title?: string;
  author?: string;
  translator?: string;
  publisher?: string;
  pub_date?: string;
  cover_url?: string;
  description?: string;
  language?: string;
  region?: string;
  category?: string;
  isbn?: string;
  rating?: number;
}

export interface BookFilters {
  rating?: number;
  language?: string;
  region?: string;
  category?: string;
  decade?: number;
  status?: string;
  tag?: string;
  search_query?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
}

export interface CreateBook {
  title: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  pub_date?: string;
  language?: string;
  region?: string;
  category?: string;
  tags?: string;
  rating?: number;
  cover_url?: string;
  description?: string;
  translator?: string;
  status?: string;
}

export type UpdateBook = Partial<CreateBook>;

export type ReadStatus = "want" | "reading" | "read";
export const STATUSES: { value: ReadStatus; label: string }[] = [
  { value: "want",    label: "想读" },
  { value: "reading", label: "在读" },
  { value: "read",    label: "已读" },
];

export interface CreateReview {
  book_id: number;
  content: string;
  reviewed_at?: string;
}

export type ViewMode = "grid" | "list";

export const LANGUAGES = ["中文", "English", "日本語", "其他"] as const;
// 固定显示的主要地域；其余地域从书籍数据中动态派生
// 筛选面板固定显示的主要地域
export const PRIMARY_REGIONS = ["中国", "日本", "美国", "英国", "法国", "德国", "俄罗斯"] as const;
// 表单下拉完整列表
export const REGIONS = [
  "中国", "日本", "美国", "英国", "法国", "德国", "俄罗斯",
  "意大利", "西班牙", "希腊", "奥地利", "加拿大", "澳大利亚", "韩国", "印度",
  "挪威", "瑞典", "瑞士", "荷兰", "比利时", "捷克", "波兰",
  "匈牙利", "罗马尼亚", "葡萄牙", "丹麦", "芬兰",
  "哥伦比亚", "阿根廷", "巴西", "墨西哥", "秘鲁", "智利",
  "爱尔兰", "以色列", "土耳其", "埃及", "南非", "尼日利亚",
  "新西兰", "新加坡", "泰国", "越南", "缅甸",
] as const;
export const CATEGORIES = ["小说", "文学", "散文", "诗歌", "历史", "古籍", "哲学", "心理", "社科", "政治", "经济", "市场", "自然科学", "数学", "物理", "计算机", "医学", "科普", "建筑", "传记", "艺术", "设计", "音乐", "漫画", "语言", "生活", "其他"] as const;
export const PRIMARY_CATEGORIES = ["小说", "文学", "散文", "历史", "社科", "计算机", "科普", "艺术"] as const;
export const RATINGS = [1, 2, 3, 4, 5] as const;
