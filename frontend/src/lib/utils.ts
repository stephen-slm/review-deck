import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(date: string | Date | number): string {
  const now = new Date();
  const then = typeof date === "number" ? new Date(date) : new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Compute perceived luminance (0-1) from a hex color string.
 * Uses the sRGB luminance formula: 0.299R + 0.587G + 0.114B.
 */
export function hexLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function prSize(
  additions: number,
  deletions: number
): { label: string; color: string } {
  const total = additions + deletions;
  if (total < 10) return { label: "XS", color: "text-gray-400" };
  if (total < 50) return { label: "S", color: "text-green-400" };
  if (total < 200) return { label: "M", color: "text-yellow-400" };
  if (total < 500) return { label: "L", color: "text-orange-400" };
  return { label: "XL", color: "text-red-400" };
}
