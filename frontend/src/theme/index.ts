import { lightTheme } from "./light";
import { nordTheme } from "./nord";
import { opencodeThemes } from "./opencode";
import { ThemeChoice, ThemeDefinition, ThemeName, ThemeTokens } from "./tokens";

// ---------------------------------------------------------------------------
// Theme registry — 2 built-in + 28 OpenCode = 30 concrete themes
// ---------------------------------------------------------------------------

const themes: Record<ThemeName, ThemeDefinition> = {
  light: lightTheme,
  nord: nordTheme,
};

// Register all OpenCode themes dynamically.
for (const t of opencodeThemes) {
  themes[t.name] = t;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** All registered concrete theme names (no "system"). */
export const themeNames: ThemeName[] = Object.keys(themes);

/** Concrete themes grouped by light / dark for UI display. */
export const lightThemeNames: ThemeName[] = themeNames.filter((n) => !themes[n].isDark);
export const darkThemeNames: ThemeName[] = themeNames.filter((n) => themes[n].isDark);

/** All selectable choices including the "system" meta-option. */
export const themeChoices: ThemeChoice[] = ["system", ...themeNames];

export function getTheme(name: ThemeName): ThemeDefinition {
  return themes[name] ?? themes["light"];
}

export function themeToCSSVariables(tokens: ThemeTokens): Record<string, string> {
  return {
    background: tokens.background,
    foreground: tokens.foreground,
    card: tokens.card,
    "card-foreground": tokens.cardForeground,
    popover: tokens.popover,
    "popover-foreground": tokens.popoverForeground,
    primary: tokens.primary,
    "primary-foreground": tokens.primaryForeground,
    secondary: tokens.secondary,
    "secondary-foreground": tokens.secondaryForeground,
    muted: tokens.muted,
    "muted-foreground": tokens.mutedForeground,
    accent: tokens.accent,
    "accent-foreground": tokens.accentForeground,
    destructive: tokens.destructive,
    "destructive-foreground": tokens.destructiveForeground,
    border: tokens.border,
    input: tokens.input,
    ring: tokens.ring,
    radius: tokens.radius,
    surface: tokens.surface,
    "surface-alt": tokens.surfaceAlt,
    success: tokens.success,
    warning: tokens.warning,
    danger: tokens.danger,
    info: tokens.info,
    "code-bg": tokens.codeBg,
    "code-border": tokens.codeBorder,
    shadow: tokens.shadow,
  };
}

export function applyThemeTokens(tokens: ThemeTokens) {
  const root = document.documentElement;
  const entries = Object.entries(themeToCSSVariables(tokens));
  for (const [key, value] of entries) {
    root.style.setProperty(`--${key}`, value);
  }
}

export type { ThemeDefinition, ThemeTokens, ThemeName };
export type { ThemeChoice };
