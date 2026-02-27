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

  const [prefersDark, setPrefersDark] = useState<boolean>(
    () => !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  // Sync with system preference changes.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Resolve the concrete theme name.
  const resolvedTheme: ThemeName = useMemo(() => {
    if (themeChoice === "system") {
      return prefersDark ? "dark" : "light";
    }
    return themeChoice;
  }, [themeChoice, prefersDark]);

  const themeDef = useMemo(() => getTheme(resolvedTheme), [resolvedTheme]);

  useEffect(() => {
    loadTheme();
  }, [loadTheme]);

  useEffect(() => {
    applyThemeTokens(themeDef.tokens);
    document.body.classList.toggle("dark", themeDef.isDark);
    document.documentElement.style.colorScheme = themeDef.isDark ? "dark" : "light";
  }, [themeDef]);

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
