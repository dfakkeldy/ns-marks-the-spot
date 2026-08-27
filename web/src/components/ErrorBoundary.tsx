import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * The app's last line of defence.
 *
 * React unmounts the whole tree when a render or effect throws and nothing
 * catches it, so before this existed every uncaught throw left a blank white
 * page: no message, no way back, and no hint that a reload would help. Real
 * paths reached it — a malformed Fletcher tile URL threw during render, and
 * Safari throws SecurityError from `history.replaceState` past 100 calls per
 * 30 seconds and from `localStorage` when the user blocks cookies.
 *
 * Deliberately a plain class component: `componentDidCatch` and
 * `getDerivedStateFromError` have no hook equivalent in React 19, and a
 * dependency for one 40-line component would not earn its place.
 *
 * Recovery is a reload rather than a state reset, because a thrown render
 * leaves the tree's state unknowable. Imported maps, georeferencing work, and
 * vector layers live in IndexedDB and survive it; the copy says so, since a
 * user who has spent an hour placing control points needs to know what a
 * reload costs before they click it.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console is the only reporting channel this app has: it ships no
    // telemetry, and user-loaded material must not leave the browser.
    console.error("Unhandled application error", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="app-error" role="alert">
        <h1>The map stopped responding</h1>
        <p>
          Something went wrong and the map could not keep running. Reloading
          usually fixes it.
        </p>
        <p>
          Maps you have imported, georeferenced, or drawn are stored in this
          browser and are not lost by reloading. The parcel you had selected
          and the layers you had switched on will reset.
        </p>
        <button
          className="primary-action"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload the map
        </button>
        <p className="app-error-detail">{error.message}</p>
      </div>
    );
  }
}
