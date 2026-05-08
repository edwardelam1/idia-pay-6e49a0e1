// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}

// ============================================================================
// PLANCK SCALE ERROR LOGGING UTILITY
// ============================================================================
export type PlanckPhase = "START" | "PROCESS" | "END" | "STALL" | "TRIGGER" | "FATAL";

export const logPlanck = (
  phase: PlanckPhase,
  action: string,
  details: string,
  error?: unknown,
) => {
  const timestamp = new Date().toISOString();
  const msg = `[${phase}] [${action}] [${timestamp}] - ${details}`;
  if (error) {
    console.error(`${msg} | TRACE:`, error);
  } else if (phase === "FATAL" || phase === "STALL") {
    console.error(msg);
  } else if (phase === "TRIGGER") {
    console.warn(msg);
  } else {
    console.log(msg);
  }
};

// ============================================================================
// RESIZEOBSERVER LOOP SUPPRESSION + CORS NOISE SHIELD
// ============================================================================
let shieldInstalled = false;

export const injectResizeObserverShield = () => {
  if (typeof window === "undefined" || shieldInstalled) return;
  shieldInstalled = true;

  logPlanck("START", "SHIELD_INIT", "Injecting ResizeObserver suppression matrix.");

  const originalError = window.console.error;

  window.addEventListener("error", (event) => {
    const m = event.message || "";
    if (
      m === "ResizeObserver loop completed with undelivered notifications." ||
      m === "ResizeObserver loop limit exceeded" ||
      m.includes("ResizeObserver")
    ) {
      logPlanck("PROCESS", "RESIZE_OBSERVER_SHIELD", "Intercepted layout thrash exception.");
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  });

  window.console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("cross-origin")) {
      logPlanck("PROCESS", "CORS_SHIELD", "Suppressed cross-origin iframe noise.");
      return;
    }
    originalError.apply(console, args as []);
  };

  logPlanck("END", "SHIELD_INIT", "Suppression matrix active.");
};

// ============================================================================
// HIERARCHICAL FALLBACK MATRIX (REACT ERROR BOUNDARY)
// ============================================================================
import { Component, type ErrorInfo, type ReactNode } from "react";

interface BoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface BoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class LiquidOSErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  public state: BoundaryState = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logPlanck(
      "FATAL",
      "REACT_TREE_COLLAPSE",
      `Component tree failure intercepted: ${error.message}`,
      errorInfo,
    );
  }

  private handleReset = () => {
    logPlanck("TRIGGER", "SYSTEM_RESET", "Manual reset triggered by user.");
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      logPlanck("PROCESS", "FALLBACK_MATRIX", "Deploying graceful degradation UI.");

      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold text-foreground">
              Nano-Bite Collapse Intercepted
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {this.state.error?.message || "Unknown Runtime Exception"}
            </p>
            <button
              onClick={this.handleReset}
              className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Force Reset Sub-Routine
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
