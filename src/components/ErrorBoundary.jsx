import { Component } from "react";
import * as Sentry from "@sentry/react";
import { T, F, FD } from "../theme/tokens";

/**
 * Keeps a render crash from blanking the whole SPA.
 * Use around new/risky surfaces (e.g. admin day mirror).
 * Reports to Sentry so Callie/Patrick see mama crashes without a screenshot.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      resetKeys: Array.isArray(props.resetKeys) ? props.resetKeys : [],
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    const before = Array.isArray(state.resetKeys) ? state.resetKeys : [];
    const after = Array.isArray(props.resetKeys) ? props.resetKeys : [];
    const changed = before.length !== after.length
      || before.some((value, index) => !Object.is(value, after[index]));
    return changed ? { error: null, resetKeys: after } : null;
  }

  componentDidCatch(error, info) {
    console.error(this.props.name || "ErrorBoundary", error, info?.componentStack);
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info?.componentStack } },
      tags: { boundary: this.props.name || "unknown" },
    });
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            marginTop: 12,
            background: T.amberSoft,
            border: `1px solid ${T.border}`,
            borderRadius: 16,
            padding: 16,
            fontFamily: F,
          }}
        >
          <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>
            {this.props.title || "This section couldn’t load"}
          </div>
          <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.55 }}>
            {this.props.message
              || "Something went wrong here. The rest of the app should still work — refresh if you need this section."}
          </div>
          <button
            type="button"
            onClick={this.reset}
            style={{
              marginTop: 12,
              border: `1.5px solid ${T.accent}`,
              borderRadius: 999,
              background: "#fff",
              color: T.accentDeep,
              padding: "8px 14px",
              fontFamily: F,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
