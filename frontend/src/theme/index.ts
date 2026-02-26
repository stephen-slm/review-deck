import { lightTheme } from "./light";
import { nordTheme } from "./nord";
import { ThemeChoice, ThemeDefinition, ThemeName, ThemeTokens } from "./tokens";

const themes: Record<ThemeName, ThemeDefinition> = {
  light: lightTheme,
  nord: nordTheme,
};

export const themeNames: ThemeName[] = Object.keys(themes) as ThemeName[];
export const themeChoices: ThemeChoice[] = ["system", ...themeNames];

export function getTheme(name: ThemeName): ThemeDefinition {
  return themes[name];
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
