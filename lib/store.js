"use client";

import { create } from "zustand";

/**
 * Document store — tracks the active document ID and its loaded data.
 */
export const useDocumentStore = create((set) => ({
  activeId: null,
  document: null,
  isLoadingDocument: false,

  setActiveId: (id) => set({ activeId: id, document: null }),
  setDocument: (doc) => set({ document: doc }),
  setLoadingDocument: (val) => set({ isLoadingDocument: val }),
  clearDocument: () => set({ activeId: null, document: null }),
}));

/**
 * Theme store — drives the dark/light mode class on <html>.
 */
export const useThemeStore = create((set) => ({
  isDark: false,
  toggleTheme: () =>
    set((state) => {
      const next = !state.isDark;
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next);
      }
      return { isDark: next };
    }),
  initTheme: () =>
    set(() => {
      const isDark =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (isDark) {
        document.documentElement.classList.add("dark");
      }
      return { isDark };
    }),
}));
