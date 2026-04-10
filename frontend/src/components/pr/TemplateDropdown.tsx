import { useState, useRef, useEffect } from "react";
import { FileText, ChevronDown } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";

interface TemplateDropdownProps {
  onSelect: (body: string) => void;
}

export function TemplateDropdown({ onSelect }: TemplateDropdownProps) {
  const templates = useSettingsStore((s) => s.reviewTemplates);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (templates.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title="Insert template"
      >
        <FileText className="h-3 w-3" />
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 right-0 z-50 min-w-[160px] rounded-md border border-border bg-popover py-1 shadow-md">
          {templates.map((t) => (
            <button
              key={t.name}
              onClick={() => { onSelect(t.body); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
