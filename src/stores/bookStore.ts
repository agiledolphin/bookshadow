import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Book, BookFilters, FilterCounts, CreateBook, UpdateBook, Review, CreateReview, ViewMode, ReadingStats, BookRecommendation, DiscoveredBook } from "../types/book";

const PAGE_SIZE = 40;

interface BookStore {
  books: Book[];
  selectedBook: Book | null;
  reviews: Review[];
  filters: BookFilters;
  filterCounts: FilterCounts | null;
  viewMode: ViewMode;
  loading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  coverNonce: Record<number, number>;
  stats: ReadingStats | null;
  recommendations: Record<number, BookRecommendation> | null;
  recommendationsLoading: boolean;

  // actions
  fetchBooks: (reset?: boolean) => Promise<void>;
  fetchFilterCounts: () => Promise<void>;
  loadMoreBooks: () => Promise<void>;
  setSearchQuery: (q: string) => void;
  selectBook: (book: Book | null) => void;
  patchBook: (id: number, patch: Partial<Book>) => void;
  createBook: (payload: CreateBook) => Promise<Book>;
  updateBook: (id: number, payload: UpdateBook) => Promise<Book>;
  deleteBook: (id: number) => Promise<void>;
  setFilters: (filters: BookFilters) => void;
  setSortBy: (sortBy: string) => void;
  setViewMode: (mode: ViewMode) => void;
  fetchStats: () => Promise<void>;
  fetchRecommendations: () => Promise<void>;
  clearRecommendations: () => void;
  discoverBooks: () => Promise<DiscoveredBook[]>;
  enrichBook: (title: string, author: string, doubanSubjectId?: string) => Promise<DiscoveredBook>;

  fetchReviews: (bookId: number) => Promise<void>;
  createReview: (payload: CreateReview) => Promise<Review>;
  updateReview: (id: number, content: string, reviewedAt?: string) => Promise<Review>;
  deleteReview: (id: number) => Promise<void>;
  importReviewMd: (bookId: number, path: string) => Promise<Review>;
}

let fetchSerial = 0;

export const useBookStore = create<BookStore>((set, get) => ({
  books: [],
  selectedBook: null,
  coverNonce: {},
  reviews: [],
  filters: {},
  filterCounts: null,
  stats: null,
  recommendations: null,
  recommendationsLoading: false,
  viewMode: "grid",
  loading: false,
  isLoadingMore: false,
  hasMore: false,
  error: null,

  fetchBooks: async (reset = true) => {
    fetchSerial += 1;
    const serial = fetchSerial;
    const { filters, books } = get();
    const offset = reset ? 0 : books.length;

    if (reset) {
      set({ loading: true, error: null, books: [] });
      get().fetchFilterCounts();
    } else {
      set({ isLoadingMore: true });
    }

    try {
      const newBooks = await invoke<Book[]>("get_books", {
        filters: { ...filters, limit: PAGE_SIZE, offset },
      });
      if (serial !== fetchSerial) return;
      set((s) => ({
        books: reset ? newBooks : [...s.books, ...newBooks],
        hasMore: newBooks.length === PAGE_SIZE,
        loading: false,
        isLoadingMore: false,
      }));
    } catch (e) {
      if (serial !== fetchSerial) return;
      set({ error: String(e), loading: false, isLoadingMore: false });
    }
  },

  loadMoreBooks: async () => {
    const { hasMore, isLoadingMore, loading } = get();
    if (!hasMore || isLoadingMore || loading) return;
    await get().fetchBooks(false);
  },

  fetchFilterCounts: async () => {
    const { filters } = get();
    try {
      const counts = await invoke<FilterCounts>("get_filter_counts", { filters });
      set({ filterCounts: counts });
    } catch (e) {
      console.warn("fetchFilterCounts failed:", e);
    }
  },

  setSearchQuery: (q: string) => {
    set((s) => ({ filters: { ...s.filters, search_query: q.trim() || undefined } }));
    get().fetchBooks(true);
  },

  selectBook: (book) => set({ selectedBook: book }),

  patchBook: (id, patch) => set((s) => ({
    books: s.books.map((b) => b.id === id ? { ...b, ...patch } : b),
    selectedBook: s.selectedBook?.id === id ? { ...s.selectedBook, ...patch } : s.selectedBook,
    coverNonce: patch.cover_local !== undefined
      ? { ...s.coverNonce, [id]: Date.now() }
      : s.coverNonce,
  })),

  createBook: async (payload) => {
    const book = await invoke<Book>("create_book", { payload });
    set((s) => ({ books: [book, ...s.books] }));
    get().fetchFilterCounts();
    if (book.cover_url) {
      invoke<string>("download_cover", { id: book.id, url: book.cover_url, isbn: book.isbn ?? null })
        .then((localPath) => {
          set((s) => {
            const updated = { ...book, cover_local: localPath };
            return {
              books: s.books.map((b) => (b.id === book.id ? updated : b)),
                            selectedBook: s.selectedBook?.id === book.id ? updated : s.selectedBook,
              coverNonce: { ...s.coverNonce, [book.id]: Date.now() },
            };
          });
        })
        .catch((err) => console.warn("封面下载失败:", err));
    }
    return book;
  },

  updateBook: async (id, payload) => {
    const book = await invoke<Book>("update_book", { id, payload });
    set((s) => ({
      selectedBook: s.selectedBook?.id === id ? book : s.selectedBook,
    }));
    get().fetchBooks(true);
    if (book.cover_url) {
      invoke<string>("download_cover", { id: book.id, url: book.cover_url, isbn: book.isbn ?? null })
        .then((localPath) => {
          set((s) => {
            const updated = { ...book, cover_local: localPath };
            return {
              books: s.books.map((b) => (b.id === id ? updated : b)),

              selectedBook: s.selectedBook?.id === id ? updated : s.selectedBook,
              coverNonce: { ...s.coverNonce, [id]: Date.now() },
            };
          });
        })
        .catch((err) => console.warn("封面下载失败:", err));
    }
    return book;
  },

  deleteBook: async (id) => {
    await invoke("delete_book", { id });
    set((s) => ({
      books: s.books.filter((b) => b.id !== id),
      selectedBook: s.selectedBook?.id === id ? null : s.selectedBook,
    }));
    get().fetchFilterCounts();
  },

  setFilters: (filters) => {
    set({ filters });
    get().fetchBooks(true);
  },

  setSortBy: (sortBy) => {
    set((s) => ({ filters: { ...s.filters, sort_by: sortBy } }));
    get().fetchBooks(true);
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
    if (mode === "stats") get().fetchStats();
  },

  fetchStats: async () => {
    try {
      const stats = await invoke<ReadingStats>("get_stats");
      set({ stats });
    } catch (e) {
      console.warn("fetchStats failed:", e);
    }
  },

  fetchRecommendations: async () => {
    set({ recommendationsLoading: true });
    try {
      const recs = await invoke<BookRecommendation[]>("recommend_books");
      const map: Record<number, BookRecommendation> = {};
      for (const r of recs) map[r.id] = r;
      set({ recommendations: map, recommendationsLoading: false });
    } catch (e) {
      set({ recommendationsLoading: false });
      throw e;
    }
  },

  clearRecommendations: () => set({ recommendations: null }),

  discoverBooks: () => invoke<DiscoveredBook[]>("discover_books"),
  enrichBook: (title, author, doubanSubjectId) => invoke<DiscoveredBook>("enrich_book", { title, author, doubanSubjectId }),

  fetchReviews: async (bookId) => {
    const reviews = await invoke<Review[]>("get_reviews", { bookId });
    set({ reviews });
  },

  createReview: async (payload) => {
    const review = await invoke<Review>("create_review", { payload });
    set((s) => ({ reviews: [review, ...s.reviews] }));
    get().patchBook(payload.book_id, {
      review_count: (get().books.find((b) => b.id === payload.book_id)?.review_count ?? 0) + 1,
    });
    get().fetchFilterCounts();
    return review;
  },

  updateReview: async (id, content, reviewedAt) => {
    const review = await invoke<Review>("update_review", {
      id,
      payload: { content, reviewed_at: reviewedAt },
    });
    set((s) => ({ reviews: s.reviews.map((r) => (r.id === id ? review : r)) }));
    return review;
  },

  deleteReview: async (id) => {
    const target = get().reviews.find((r) => r.id === id);
    await invoke("delete_review", { id });
    set((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) }));
    if (target) {
      get().patchBook(target.book_id, {
        review_count: Math.max(0, (get().books.find((b) => b.id === target.book_id)?.review_count ?? 1) - 1),
      });
    }
    get().fetchFilterCounts();
  },

  importReviewMd: async (bookId, path) => {
    const review = await invoke<Review>("import_review_md", { bookId, path });
    set((s) => ({ reviews: [review, ...s.reviews] }));
    get().patchBook(bookId, {
      review_count: (get().books.find((b) => b.id === bookId)?.review_count ?? 0) + 1,
    });
    get().fetchFilterCounts();
    return review;
  },
}));
