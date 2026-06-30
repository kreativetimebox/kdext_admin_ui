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
        try {
          localStorage.setItem("theme", next ? "dark" : "light");
        } catch {}
      }
      return { isDark: next };
    }),
  initTheme: () =>
    set(() => {
      if (typeof window === "undefined") return {};
      let stored = null;
      try {
        stored = localStorage.getItem("theme");
      } catch {}
      const isDark =
        stored != null
          ? stored === "dark"
          : window.matchMedia("(prefers-color-scheme: dark)").matches;
      // Always keep the class in sync with state (add OR remove),
      // so a manual choice survives navigation between pages.
      document.documentElement.classList.toggle("dark", isDark);
      return { isDark };
    }),
}));
