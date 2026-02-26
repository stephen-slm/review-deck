export type ThemeName = "light" | "nord";
export type ThemeChoice = ThemeName | "system";

export interface ThemeTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  radius: string;
  // Extended tokens for components outside the Tailwind palette.
  surface: string;
  surfaceAlt: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  codeBg: string;
  codeBorder: string;
  shadow: string;
}

export interface ThemeDefinition {
  name: ThemeName;
  tokens: ThemeTokens;
  displayName: string;
  preview: { background: string; accent: string };
}
