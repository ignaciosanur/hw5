import { Component, type ReactNode } from "react";

/** Last line of defence: a render error shows a plain message, never a blank desk. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>The desk hit a display error.</h1>
        <p>No data was changed by this. The backend and database are still the source of truth.</p>
        <pre>{this.state.error.message}</pre>
        <button className="btn btn--primary" onClick={() => location.reload()}>Reload the desk</button>
      </div>
    );
  }
}
