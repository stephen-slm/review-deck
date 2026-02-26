import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applyThemeTokens, getTheme, themeChoices, ThemeChoice, ThemeName, ThemeTokens } from "./index";
import { useSettingsStore } from "@/stores/settingsStore";

interface ThemeContextValue {
  themeChoice: ThemeChoice;
  resolvedTheme: ThemeName;
  tokens: ThemeTokens;
  availableThemes: ThemeChoice[];
  setTheme: (name: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeChoice = useSettingsStore((s) => s.theme);
  const setThemeChoice = useSettingsStore((s) => s.setTheme);
  const loadTheme = useSettingsStore((s) => s.loadTheme);

  const [systemTheme, setSystemTheme] = useState<ThemeName>(() =>
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "nord" : "light",
  );

  // Sync with system preference changes when choice is system.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "nord" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedTheme: ThemeName = themeChoice === "system" ? systemTheme : themeChoice;
  const themeDef = useMemo(() => getTheme(resolvedTheme), [resolvedTheme]);

  useEffect(() => {
    loadTheme();
  }, [loadTheme]);

  useEffect(() => {
    applyThemeTokens(themeDef.tokens);
    document.body.classList.toggle("dark", resolvedTheme === "nord");
  }, [themeDef.tokens, resolvedTheme]);

  const setTheme = useCallback(
    (name: ThemeChoice) => {
      if (name === themeChoice) return;
      void setThemeChoice(name);
    },
    [setThemeChoice, themeChoice],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ themeChoice, resolvedTheme, tokens: themeDef.tokens, availableThemes: themeChoices, setTheme }),
    [setTheme, themeChoice, themeDef.tokens, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
