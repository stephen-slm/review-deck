/**
 * Convert a hex color string (#rrggbb or #rgb) to an HSL component string
 * in the format "H S% L%" (no hsl() wrapper) for Tailwind CSS variable usage.
 */
export function hexToHSL(hex: string): string {
  // Normalise shorthand (#rgb → #rrggbb).
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }

  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic.
    return `0 0% ${round(l * 100)}%`;
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let hue: number;
  switch (max) {
    case r:
      hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      hue = ((b - r) / d + 2) / 6;
      break;
    default:
      hue = ((r - g) / d + 4) / 6;
      break;
  }

  return `${round(hue * 360)} ${round(s * 100)}% ${round(l * 100)}%`;
}

/** Round to 1 decimal place. */
function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Compute relative luminance of a hex color.
 * Returns a value between 0 (black) and 1 (white).
 */
export function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Pick a contrasting foreground HSL string for a given hex background.
 * Returns a near-white or near-black HSL component string.
 */
export function contrastForeground(bgHex: string, darkFg: string, lightFg: string): string {
  return luminance(bgHex) > 0.4 ? darkFg : lightFg;
}
