import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Phase 11 wires this to Sentry; until then surface via DOM event.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('app:error', { detail: { error, componentStack: info.componentStack } }),
      );
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        this.props.fallback ?? (
          <div role="alert" style={{ padding: 24, fontFamily: 'system-ui' }}>
            <h1>Something went wrong.</h1>
            <p>{error.message}</p>
            <button type="button" onClick={this.reset}>
              Reload UI
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
