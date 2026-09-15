import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

function resolveInitialDarkMode() {
  if (typeof window === "undefined") return false;

  const stored = localStorage.getItem("theme");
  if (stored) return stored === "dark";

  // VITE_DEFAULT_THEME: "light" | "dark" | "system" (default).
  const configured =
    import.meta.env.VITE_DEFAULT_THEME || "system";
  if (configured === "dark") return true;
  if (configured === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(resolveInitialDarkMode);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const toggleTheme = () => setDarkMode((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

const NOOP_THEME = {
  darkMode: false,
  toggleTheme: () => {},
};

export function useTheme() {
  const context = useContext(ThemeContext);
  return context ?? NOOP_THEME;
}