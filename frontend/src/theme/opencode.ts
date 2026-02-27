/**
 * OpenCode theme definitions.
 *
 * Each theme is inlined from the OpenCode repository (14 themes x 2 variants = 28 ThemeDefinitions).
 * The converter maps OpenCode's hex-based JSON structure to our HSL-component ThemeTokens.
 */
import { hexToHSL, contrastForeground } from "./colorUtils";
import { ThemeDefinition, ThemeTokens } from "./tokens";

// ---------------------------------------------------------------------------
// Types mirroring the relevant subset of the OpenCode theme JSON format
// ---------------------------------------------------------------------------

interface OCSeeds {
  primary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

interface OCOverrides {
  "background-base"?: string;
  "background-weak"?: string;
  "background-strong"?: string;
  "border-base"?: string;
  "border-weak-base"?: string;
  "text-base"?: string;
  "text-weak"?: string;
  [key: string]: string | undefined;
}

interface OCVariant {
  seeds: OCSeeds;
  overrides: OCOverrides;
}

interface OCTheme {
  name: string;
  id: string;
  light: OCVariant;
  dark: OCVariant;
}

// ---------------------------------------------------------------------------
// Converter
// ---------------------------------------------------------------------------

function convert(variant: OCVariant, isDark: boolean): ThemeTokens {
  const o = variant.overrides;
  const s = variant.seeds;

  const bg = o["background-base"] ?? (isDark ? "#1e1e2e" : "#ffffff");
  const fg = o["text-base"] ?? (isDark ? "#d4d4d4" : "#1e1e1e");
  const card = o["background-strong"] ?? bg;
  const weak = o["background-weak"] ?? bg;
  const border = o["border-base"] ?? o["border-weak-base"] ?? (isDark ? "#3c3c3c" : "#d4d4d4");
  const mutedFg = o["text-weak"] ?? fg;

  // Computed foreground that contrasts with the primary seed
  const darkFg = hexToHSL(isDark ? bg : "#1e1e1e");
  const lightFg = hexToHSL(isDark ? "#ffffff" : "#ffffff");
  const primaryFg = contrastForeground(s.primary, darkFg, lightFg);
  const destructiveFg = contrastForeground(s.error, darkFg, lightFg);

  return {
    background: hexToHSL(bg),
    foreground: hexToHSL(fg),
    card: hexToHSL(card),
    cardForeground: hexToHSL(fg),
    popover: hexToHSL(card),
    popoverForeground: hexToHSL(fg),
    primary: hexToHSL(s.primary),
    primaryForeground: primaryFg,
    secondary: hexToHSL(weak),
    secondaryForeground: hexToHSL(fg),
    muted: hexToHSL(weak),
    mutedForeground: hexToHSL(mutedFg),
    accent: hexToHSL(s.primary),
    accentForeground: primaryFg,
    destructive: hexToHSL(s.error),
    destructiveForeground: destructiveFg,
    border: hexToHSL(border),
    input: hexToHSL(border),
    ring: hexToHSL(s.primary),
    radius: "0.5rem",
    surface: hexToHSL(card),
    surfaceAlt: hexToHSL(weak),
    success: hexToHSL(s.success),
    warning: hexToHSL(s.warning),
    danger: hexToHSL(s.error),
    info: hexToHSL(s.info),
    codeBg: hexToHSL(weak),
    codeBorder: hexToHSL(border),
    shadow: isDark
      ? "0 10px 30px rgba(0, 0, 0, 0.35)"
      : "0 10px 30px rgba(17, 24, 39, 0.08)",
  };
}

function buildPair(theme: OCTheme): [ThemeDefinition, ThemeDefinition] {
  const lightDef: ThemeDefinition = {
    name: `${theme.id}-light`,
    displayName: `${theme.name} Light`,
    isDark: false,
    description: `${theme.name} — light variant`,
    preview: {
      background: theme.light.overrides["background-base"] ?? "#ffffff",
      accent: theme.light.seeds.primary,
    },
    tokens: convert(theme.light, false),
  };

  const darkDef: ThemeDefinition = {
    name: `${theme.id}-dark`,
    displayName: `${theme.name} Dark`,
    isDark: true,
    description: `${theme.name} — dark variant`,
    preview: {
      background: theme.dark.overrides["background-base"] ?? "#1e1e2e",
      accent: theme.dark.seeds.primary,
    },
    tokens: convert(theme.dark, true),
  };

  return [lightDef, darkDef];
}

// ---------------------------------------------------------------------------
// Inlined theme data (14 themes)
// ---------------------------------------------------------------------------

const ocThemes: OCTheme[] = [
  {
    name: "Aura",
    id: "aura",
    light: {
      seeds: { primary: "#a277ff", success: "#40bf7a", warning: "#d9a24a", error: "#d94f4f", info: "#5bb8d9" },
      overrides: {
        "background-base": "#f5f0ff", "background-weak": "#efe8fc", "background-strong": "#faf7ff",
        "border-base": "#b5a6d4", "border-weak-base": "#e0d6f2",
        "text-base": "#2d2640", "text-weak": "#5c5270",
      },
    },
    dark: {
      seeds: { primary: "#a277ff", success: "#61ffca", warning: "#ffca85", error: "#ff6767", info: "#82e2ff" },
      overrides: {
        "background-base": "#15141b", "background-weak": "#1a1921", "background-strong": "#121118",
        "border-base": "#433f5a", "border-weak-base": "#2d2b38",
        "text-base": "#edecee", "text-weak": "#6d6d6d",
      },
    },
  },
  {
    name: "Ayu",
    id: "ayu",
    light: {
      seeds: { primary: "#4aa8c8", success: "#5fb978", warning: "#ea9f41", error: "#e6656a", info: "#2f9bce" },
      overrides: {
        "background-base": "#fdfaf4", "background-weak": "#fcf9f3", "background-strong": "#fbf8f2",
        "border-base": "#bfb3a3", "border-weak-base": "#e6ddcf",
        "text-base": "#4f5964", "text-weak": "#77818d",
      },
    },
    dark: {
      seeds: { primary: "#3fb7e3", success: "#78d05c", warning: "#e4a75c", error: "#f58572", info: "#66c6f1" },
      overrides: {
        "background-base": "#0f1419", "background-weak": "#18222c", "background-strong": "#0b1015",
        "border-base": "#475367", "border-weak-base": "#2b3440",
        "text-base": "#d6dae0", "text-weak": "#a3adba",
      },
    },
  },
  {
    name: "Carbonfox",
    id: "carbonfox",
    light: {
      seeds: { primary: "#0072c3", success: "#198038", warning: "#f1c21b", error: "#da1e28", info: "#0043ce" },
      overrides: {
        "background-base": "#ffffff", "background-weak": "#f4f4f4", "background-strong": "#e8e8e8",
        "border-base": "#c6c6c6", "border-weak-base": "#c6c6c6",
        "text-base": "#161616", "text-weak": "#525252",
      },
    },
    dark: {
      seeds: { primary: "#33b1ff", success: "#42be65", warning: "#f1c21b", error: "#ff8389", info: "#78a9ff" },
      overrides: {
        "background-base": "#161616", "background-weak": "#262626", "background-strong": "#0d0d0d",
        "border-base": "#525252", "border-weak-base": "#393939",
        "text-base": "#f2f4f8", "text-weak": "#8d8d8d",
      },
    },
  },
  {
    name: "Catppuccin",
    id: "catppuccin",
    light: {
      seeds: { primary: "#7287fd", success: "#40a02b", warning: "#df8e1d", error: "#d20f39", info: "#04a5e5" },
      overrides: {
        "background-base": "#f5e0dc", "background-weak": "#f2d8d4", "background-strong": "#f9e8e4",
        "border-base": "#bca6b2", "border-weak-base": "#e0cfd3",
        "text-base": "#4c4f69", "text-weak": "#6c6f85",
      },
    },
    dark: {
      seeds: { primary: "#b4befe", success: "#a6d189", warning: "#f4b8e4", error: "#f38ba8", info: "#89dceb" },
      overrides: {
        "background-base": "#1e1e2e", "background-weak": "#211f31", "background-strong": "#1c1c29",
        "border-base": "#4a4763", "border-weak-base": "#35324a",
        "text-base": "#cdd6f4", "text-weak": "#a6adc8",
      },
    },
  },
  {
    name: "Dracula",
    id: "dracula",
    light: {
      seeds: { primary: "#7c6bf5", success: "#2fbf71", warning: "#f7a14d", error: "#d9536f", info: "#1d7fc5" },
      overrides: {
        "background-base": "#f8f8f2", "background-weak": "#f1f2ed", "background-strong": "#f6f6f1",
        "border-base": "#c4c6ba", "border-weak-base": "#e2e3da",
        "text-base": "#1f1f2f", "text-weak": "#52526b",
      },
    },
    dark: {
      seeds: { primary: "#bd93f9", success: "#50fa7b", warning: "#ffb86c", error: "#ff5555", info: "#8be9fd" },
      overrides: {
        "background-base": "#14151f", "background-weak": "#181926", "background-strong": "#161722",
        "border-base": "#3f415a", "border-weak-base": "#2d2f3c",
        "text-base": "#f8f8f2", "text-weak": "#b6b9e4",
      },
    },
  },
  {
    name: "Gruvbox",
    id: "gruvbox",
    light: {
      seeds: { primary: "#076678", success: "#79740e", warning: "#b57614", error: "#9d0006", info: "#8f3f71" },
      overrides: {
        "background-base": "#fbf1c7", "background-weak": "#f2e5bc", "background-strong": "#f9f5d7",
        "border-base": "#bdae93", "border-weak-base": "#d5c4a1",
        "text-base": "#3c3836", "text-weak": "#7c6f64",
      },
    },
    dark: {
      seeds: { primary: "#83a598", success: "#b8bb26", warning: "#fabd2f", error: "#fb4934", info: "#d3869b" },
      overrides: {
        "background-base": "#282828", "background-weak": "#32302f", "background-strong": "#1d2021",
        "border-base": "#665c54", "border-weak-base": "#504945",
        "text-base": "#ebdbb2", "text-weak": "#a89984",
      },
    },
  },
  {
    name: "Monokai",
    id: "monokai",
    light: {
      seeds: { primary: "#bf7bff", success: "#4fb54b", warning: "#f1a948", error: "#e54b4b", info: "#2d9ad7" },
      overrides: {
        "background-base": "#fdf8ec", "background-weak": "#f8f2e6", "background-strong": "#fbf5e8",
        "border-base": "#c7b9a5", "border-weak-base": "#e9e0cf",
        "text-base": "#292318", "text-weak": "#6d5c40",
      },
    },
    dark: {
      seeds: { primary: "#ae81ff", success: "#a6e22e", warning: "#fd971f", error: "#f92672", info: "#66d9ef" },
      overrides: {
        "background-base": "#23241e", "background-weak": "#27281f", "background-strong": "#25261f",
        "border-base": "#494a3a", "border-weak-base": "#343528",
        "text-base": "#f8f8f2", "text-weak": "#c5c5c0",
      },
    },
  },
  {
    name: "Night Owl",
    id: "nightowl",
    light: {
      seeds: { primary: "#4876d6", success: "#2aa298", warning: "#c96765", error: "#de3d3b", info: "#4876d6" },
      overrides: {
        "background-base": "#fbfbfb", "background-weak": "#f0f0f0", "background-strong": "#ffffff",
        "border-base": "#c0c0c0", "border-weak-base": "#d9d9d9",
        "text-base": "#403f53", "text-weak": "#7a8181",
      },
    },
    dark: {
      seeds: { primary: "#82aaff", success: "#c5e478", warning: "#ecc48d", error: "#ef5350", info: "#82aaff" },
      overrides: {
        "background-base": "#011627", "background-weak": "#0b253a", "background-strong": "#001122",
        "border-base": "#3a5a75", "border-weak-base": "#1d3b53",
        "text-base": "#d6deeb", "text-weak": "#5f7e97",
      },
    },
  },
  {
    name: "Nord (OC)",
    id: "nord-oc",
    light: {
      seeds: { primary: "#5e81ac", success: "#8fbcbb", warning: "#d08770", error: "#bf616a", info: "#81a1c1" },
      overrides: {
        "background-base": "#eceff4", "background-weak": "#e4e8f0", "background-strong": "#f1f3f8",
        "border-base": "#afb7cb", "border-weak-base": "#d5dbe7",
        "text-base": "#2e3440", "text-weak": "#4c566a",
      },
    },
    dark: {
      seeds: { primary: "#88c0d0", success: "#a3be8c", warning: "#d08770", error: "#bf616a", info: "#81a1c1" },
      overrides: {
        "background-base": "#1f2430", "background-weak": "#222938", "background-strong": "#1c202a",
        "border-base": "#4a5163", "border-weak-base": "#343a47",
        "text-base": "#e5e9f0", "text-weak": "#a4adbf",
      },
    },
  },
  {
    name: "One Dark Pro",
    id: "onedarkpro",
    light: {
      seeds: { primary: "#528bff", success: "#4fa66d", warning: "#d19a66", error: "#e06c75", info: "#61afef" },
      overrides: {
        "background-base": "#f5f6f8", "background-weak": "#eef0f4", "background-strong": "#fafbfc",
        "border-base": "#b5bccd", "border-weak-base": "#dee2eb",
        "text-base": "#2b303b", "text-weak": "#6b717f",
      },
    },
    dark: {
      seeds: { primary: "#61afef", success: "#98c379", warning: "#e5c07b", error: "#e06c75", info: "#56b6c2" },
      overrides: {
        "background-base": "#1e222a", "background-weak": "#212631", "background-strong": "#1b1f27",
        "border-base": "#4a5164", "border-weak-base": "#323848",
        "text-base": "#abb2bf", "text-weak": "#818899",
      },
    },
  },
  {
    name: "Shades of Purple",
    id: "shadesofpurple",
    light: {
      seeds: { primary: "#7a5af8", success: "#3dd598", warning: "#f7c948", error: "#ff6bd5", info: "#62d4ff" },
      overrides: {
        "background-base": "#f7ebff", "background-weak": "#f2e2ff", "background-strong": "#fbf2ff",
        "border-base": "#baa4d5", "border-weak-base": "#e5d3ff",
        "text-base": "#3b2c59", "text-weak": "#6c568f",
      },
    },
    dark: {
      seeds: { primary: "#c792ff", success: "#7be0b0", warning: "#ffd580", error: "#ff7ac6", info: "#7dd4ff" },
      overrides: {
        "background-base": "#1a102b", "background-weak": "#1f1434", "background-strong": "#1c122f",
        "border-base": "#4d3a73", "border-weak-base": "#352552",
        "text-base": "#f5f0ff", "text-weak": "#c9b6ff",
      },
    },
  },
  {
    name: "Solarized",
    id: "solarized",
    light: {
      seeds: { primary: "#268bd2", success: "#859900", warning: "#b58900", error: "#dc322f", info: "#2aa198" },
      overrides: {
        "background-base": "#fdf6e3", "background-weak": "#f6efda", "background-strong": "#faf3dc",
        "border-base": "#bcb5a0", "border-weak-base": "#e3e0cd",
        "text-base": "#586e75", "text-weak": "#7a8c8e",
      },
    },
    dark: {
      seeds: { primary: "#6c71c4", success: "#859900", warning: "#b58900", error: "#dc322f", info: "#2aa198" },
      overrides: {
        "background-base": "#001f27", "background-weak": "#022733", "background-strong": "#01222b",
        "border-base": "#31505b", "border-weak-base": "#20373f",
        "text-base": "#93a1a1", "text-weak": "#6c7f80",
      },
    },
  },
  {
    name: "Tokyo Night",
    id: "tokyonight",
    light: {
      seeds: { primary: "#2e7de9", success: "#587539", warning: "#8c6c3e", error: "#c94060", info: "#007197" },
      overrides: {
        "background-base": "#e1e2e7", "background-weak": "#dee0ea", "background-strong": "#e5e6ee",
        "border-base": "#a7abbb", "border-weak-base": "#cdd0dc",
        "text-base": "#273153", "text-weak": "#5c6390",
      },
    },
    dark: {
      seeds: { primary: "#7aa2f7", success: "#9ece6a", warning: "#e0af68", error: "#f7768e", info: "#7dcfff" },
      overrides: {
        "background-base": "#0f111a", "background-weak": "#111428", "background-strong": "#101324",
        "border-base": "#3a3e57", "border-weak-base": "#25283b",
        "text-base": "#c0caf5", "text-weak": "#7a88cf",
      },
    },
  },
  {
    name: "Vesper",
    id: "vesper",
    light: {
      seeds: { primary: "#FFC799", success: "#99FFE4", warning: "#FFC799", error: "#FF8080", info: "#FFC799" },
      overrides: {
        "background-base": "#FFFFFF", "background-weak": "#F8F8F8", "background-strong": "#F0F0F0",
        "border-base": "#D0D0D0", "border-weak-base": "#E0E0E0",
        "text-base": "#101010", "text-weak": "#606060",
      },
    },
    dark: {
      seeds: { primary: "#FFC799", success: "#99FFE4", warning: "#FFC799", error: "#FF8080", info: "#FFC799" },
      overrides: {
        "background-base": "#101010", "background-weak": "#141414", "background-strong": "#0C0C0C",
        "border-base": "#282828", "border-weak-base": "#1C1C1C",
        "text-base": "#FFFFFF", "text-weak": "#A0A0A0",
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Build all 28 theme definitions
// ---------------------------------------------------------------------------

export const opencodeThemes: ThemeDefinition[] = ocThemes.flatMap((t) => buildPair(t));
