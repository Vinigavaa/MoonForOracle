import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 16,
          padding: 32,
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
        }}>
          <div style={{ fontSize: 32 }}>{"\u26A0"}</div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{
            fontSize: "var(--font-size-sm)",
            color: "var(--text-muted)",
            textAlign: "center",
            maxWidth: 500,
          }}>
            An unexpected error occurred. You can try reloading the application.
          </p>
          <div style={{
            padding: "8px 16px",
            background: "rgba(243, 139, 168, 0.08)",
            border: "1px solid rgba(243, 139, 168, 0.2)",
            borderRadius: "var(--radius)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--danger)",
            maxWidth: 500,
            overflow: "auto",
            wordBreak: "break-word",
          }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); }}
            style={{
              padding: "8px 24px",
              background: "var(--accent)",
              color: "var(--bg-primary)",
              border: "none",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Try to recover
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
