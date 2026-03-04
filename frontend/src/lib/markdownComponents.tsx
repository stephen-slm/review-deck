import { type Components } from "react-markdown";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";

/** Rewrite GitHub image URLs to go through the authenticated backend proxy. */
export function proxyImageSrc(src: string | undefined): string | undefined {
  if (!src) return src;
  try {
    const u = new URL(src);
    const host = u.hostname.toLowerCase();
    if (
      host.endsWith("githubusercontent.com") ||
      host.endsWith("github.com")
    ) {
      return `/api/proxy/image?url=${encodeURIComponent(src)}`;
    }
  } catch {
    // Not a valid URL — return as-is.
  }
  return src;
}

/** Custom markdown components — opens links in the system browser via Wails. */
export const mdComponents: Components = {
  a: ({ href, children, ...props }) => (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) BrowserOpenURL(href);
      }}
      className="cursor-pointer text-primary underline hover:text-primary/80"
    >
      {children}
    </a>
  ),
  img: ({ src, alt, ...props }) => (
    <img
      {...props}
      src={proxyImageSrc(src)}
      alt={alt || ""}
      className="my-2 max-w-full rounded-md border border-border"
      loading="lazy"
    />
  ),
  details: ({ children, ...props }) => (
    <details
      {...props}
      className="group rounded-md border border-border my-2"
    >
      {children}
    </details>
  ),
  summary: ({ children, ...props }) => (
    <summary
      {...props}
      className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 rounded-md list-none [&::-webkit-details-marker]:hidden"
    >
      {children}
    </summary>
  ),
};
