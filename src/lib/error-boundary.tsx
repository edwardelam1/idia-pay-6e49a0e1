import { Component, type ErrorInfo, type ReactNode } from "react";
import { logPlanck } from "@/lib/error-capture";

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
