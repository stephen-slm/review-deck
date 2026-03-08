import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Copy, CheckCircle, RefreshCw } from "lucide-react";
import { formatDebugLog } from "@/lib/debugLog";

interface Props {
  children: ReactNode;
  /** Optional label shown in the header (e.g. "PR Detail Page"). */
  label?: string;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  /** Snapshot of the debug ring buffer at crash time. */
  debugSnapshot: string;
  copied: boolean;
}

/**
 * Error boundary that catches React render errors and displays the full
 * error message, component stack, JS stack trace, and the debug log
 * ring buffer with a one-click "Copy report" button.
 *
 * Wails production builds ship minified React, so the default error overlay
 * only shows an opaque error code (e.g. #185). This boundary captures the
 * debug log that was recording leading up to the crash.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null, debugSnapshot: "", copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Capture the debug log immediately — this runs synchronously when the
    // error is thrown, so the buffer reflects the state at crash time.
    return { error, debugSnapshot: formatDebugLog() };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  private buildReport(): string {
    const { error, errorInfo, debugSnapshot } = this.state;
    const lines: string[] = [
      "=== React Error Report ===",
      `Time: ${new Date().toISOString()}`,
      `Label: ${this.props.label ?? "(none)"}`,
      `URL: ${window.location.href}`,
      "",
      "--- Error ---",
      String(error),
      "",
      "--- JS Stack ---",
      error?.stack ?? "(no stack)",
      "",
      "--- Component Stack ---",
      errorInfo?.componentStack ?? "(no component stack)",
      "",
      "--- Debug Log (last ~200 entries) ---",
      debugSnapshot || "(empty)",
    ];
    return lines.join("\n");
  }

  private handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(this.buildReport());
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Fallback: select a textarea (clipboard API may be blocked).
    }
  };

  private handleRetry = () => {
    this.setState({ error: null, errorInfo: null, debugSnapshot: "", copied: false });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const { error, errorInfo, debugSnapshot, copied } = this.state;

    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        {/* Header */}
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-lg font-semibold">
            Something went wrong{this.props.label ? ` in ${this.props.label}` : ""}
          </h2>
        </div>

        {/* Error message */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm font-medium text-destructive">{String(error)}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={this.handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            {copied ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy full report
              </>
            )}
          </button>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>

        {/* Debug Log */}
        {debugSnapshot && (
          <details open className="space-y-1">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Debug Log (last ~200 entries before crash)
            </summary>
            <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs text-foreground">
              {debugSnapshot}
            </pre>
          </details>
        )}

        {/* JS Stack */}
        {error?.stack && (
          <details className="space-y-1">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              JS Stack Trace
            </summary>
            <pre className="max-h-60 overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs text-foreground">
              {error.stack}
            </pre>
          </details>
        )}

        {/* Component Stack */}
        {errorInfo?.componentStack && (
          <details className="space-y-1">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Component Stack
            </summary>
            <pre className="max-h-60 overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs text-foreground">
              {errorInfo.componentStack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
