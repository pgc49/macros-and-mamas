import { Component } from "react";
import { T, F, FD } from "../theme/tokens";

/**
 * Keeps a render crash from blanking the whole SPA.
 * Use around new/risky surfaces (e.g. admin day mirror).
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(this.props.name || "ErrorBoundary", error, info?.componentStack);
  }

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
        </div>
      );
    }
    return this.props.children;
  }
}
