import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Book, BookFilters, CreateBook, UpdateBook, Review, CreateReview, ViewMode } from "../types/book";

interface BookStore {
  books: Book[];
  allBooks: Book[];
  selectedBook: Book | null;
  reviews: Review[];
  filters: BookFilters;
  searchQuery: string;
  viewMode: ViewMode;
  loading: boolean;
  error: string | null;

  // actions
  fetchBooks: () => Promise<void>;
  refreshAllBooks: () => Promise<void>;
  searchBooks: (query: string) => Promise<void>;
  selectBook: (book: Book | null) => void;
  createBook: (payload: CreateBook) => Promise<Book>;
  updateBook: (id: number, payload: UpdateBook) => Promise<Book>;
  deleteBook: (id: number) => Promise<void>;
  setFilters: (filters: BookFilters) => void;
  setViewMode: (mode: ViewMode) => void;

  fetchReviews: (bookId: number) => Promise<void>;
  createReview: (payload: CreateReview) => Promise<Review>;
  updateReview: (id: number, content: string, reviewedAt?: string) => Promise<Review>;
  deleteReview: (id: number) => Promise<void>;
  importReviewMd: (bookId: number, path: string) => Promise<Review>;
}

export const useBookStore = create<BookStore>((set, get) => ({
  books: [],
  allBooks: [],
  selectedBook: null,
  reviews: [],
  filters: {},
  searchQuery: "",
  viewMode: "grid",
  loading: false,
  error: null,

  fetchBooks: async () => {
    set({ loading: true, error: null });
    try {
      const books = await invoke<Book[]>("get_books", { filters: get().filters });
      set({ books, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  refreshAllBooks: async () => {
    const allBooks = await invoke<Book[]>("get_books", { filters: {} });
    set({ allBooks });
  },

  searchBooks: async (query: string) => {
    set({ loading: true, error: null, searchQuery: query });
    try {
      const books = await invoke<Book[]>("search_books", { query });
      set({ books, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  selectBook: (book) => set({ selectedBook: book }),

  createBook: async (payload) => {
    const book = await invoke<Book>("create_book", { payload });
    set((s) => ({ books: [book, ...s.books], allBooks: [book, ...s.allBooks] }));
    if (book.cover_url && !book.cover_local) {
      invoke<string>("download_cover", { id: book.id, url: book.cover_url, isbn: book.isbn ?? null })
        .then((localPath) => {
          set((s) => {
            const updated = { ...book, cover_local: localPath };
            return {
              books: s.books.map((b) => (b.id === book.id ? updated : b)),
              selectedBook: s.selectedBook?.id === book.id ? updated : s.selectedBook,
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
      books: s.books.map((b) => (b.id === id ? book : b)),
      allBooks: s.allBooks.map((b) => (b.id === id ? book : b)),
      selectedBook: s.selectedBook?.id === id ? book : s.selectedBook,
    }));
    if (book.cover_url && !book.cover_local) {
      invoke<string>("download_cover", { id: book.id, url: book.cover_url, isbn: book.isbn ?? null })
        .then((localPath) => {
          set((s) => {
            const updated = { ...book, cover_local: localPath };
            return {
              books: s.books.map((b) => (b.id === id ? updated : b)),
              selectedBook: s.selectedBook?.id === id ? updated : s.selectedBook,
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
      allBooks: s.allBooks.filter((b) => b.id !== id),
      selectedBook: s.selectedBook?.id === id ? null : s.selectedBook,
    }));
  },

  setFilters: (filters) => {
    set({ filters });
    get().fetchBooks();
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  fetchReviews: async (bookId) => {
    const reviews = await invoke<Review[]>("get_reviews", { bookId });
    set({ reviews });
  },

  createReview: async (payload) => {
    const review = await invoke<Review>("create_review", { payload });
    set((s) => ({ reviews: [review, ...s.reviews] }));
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
    await invoke("delete_review", { id });
    set((s) => ({ reviews: s.reviews.filter((r) => r.id !== id) }));
  },

  importReviewMd: async (bookId, path) => {
    const review = await invoke<Review>("import_review_md", { bookId, path });
    set((s) => ({ reviews: [review, ...s.reviews] }));
    return review;
  },
}));
