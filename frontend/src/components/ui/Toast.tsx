import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  duration?: number;
  onClick?: () => void;
}

interface ToastContextValue {
  addToast: (message: string, type?: Toast["type"], duration?: number, onClick?: () => void) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: Toast["type"] = "info", duration = 4000, onClick?: () => void) => {
      const id = String(++nextId);
      setToasts((prev) => [...prev, { id, message, type, duration, onClick }]);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (!toast.duration) return;
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const Icon =
    toast.type === "success"
      ? CheckCircle
      : toast.type === "error"
      ? AlertCircle
      : Info;

  const iconColor =
    toast.type === "success"
      ? "text-green-500"
      : toast.type === "error"
      ? "text-destructive"
      : "text-blue-500";

  const handleClick = toast.onClick
    ? () => {
        toast.onClick?.();
        setIsExiting(true);
        setTimeout(() => onDismiss(toast.id), 200);
      }
    : undefined;

  return (
    <div
      className={cn(
        "flex w-80 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-lg transition-all duration-200",
        isExiting ? "translate-x-full opacity-0" : "translate-x-0 opacity-100",
        handleClick && "cursor-pointer hover:bg-accent/50"
      )}
      onClick={handleClick}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{toast.message}</p>
        {handleClick && (
          <p className="mt-0.5 text-xs text-muted-foreground">Click to view</p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsExiting(true);
          setTimeout(() => onDismiss(toast.id), 200);
        }}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
