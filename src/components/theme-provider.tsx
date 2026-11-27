"use client";
import { useSelectedLayoutSegment } from "next/navigation";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
type Theme = "light" | "dark" | "system";
type ThemeKey = "planora-theme" | "planora-demo-theme";
const volatileThemes: Partial<Record<ThemeKey, Theme>> = {};
const themeChange = "planora-theme-change";

function readTheme(key: ThemeKey, fallback: Theme): Theme {
  try {
    const value = volatileThemes[key] ?? localStorage.getItem(key);
    if (value === "light" || value === "dark" || value === "system")
      return value;
  } catch {
    // The browser can block storage for this visit.
  }
  return fallback;
}

function saveTheme(key: ThemeKey, value: Theme) {
  try {
    localStorage.setItem(key, value);
    delete volatileThemes[key];
  } catch {
    volatileThemes[key] = value;
  }
  window.dispatchEvent(new Event(themeChange));
}

function subscribe(notify: () => void) {
  window.addEventListener(themeChange, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(themeChange, notify);
    window.removeEventListener("storage", notify);
  };
}
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (value: Theme) => void;
} | null>(null);
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const demo = useSelectedLayoutSegment() === "demo";
  const key: ThemeKey = demo ? "planora-demo-theme" : "planora-theme";
  const fallback = demo ? "light" : "system";
  const theme = useSyncExternalStore(
    subscribe,
    () => readTheme(key, fallback),
    () => fallback,
  );
  useLayoutEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)"),
      apply = () => {
        const dark = theme === "dark" || (theme === "system" && media.matches);
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.colorScheme = dark ? "dark" : "light";
      };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  const value = useMemo(
    () => ({
      theme,
      setTheme: (next: Theme) => saveTheme(key, next),
    }),
    [key, theme],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
