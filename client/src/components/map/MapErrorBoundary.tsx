import { Component, type ReactNode } from "react";

export class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    const msg = error?.message || "";
    if (msg.includes("_leaflet") || msg.includes("Map container") || msg.includes("getPosition")) {
      setTimeout(() => this.setState({ hasError: false }), 500);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-background text-muted-foreground">
          <button
            className="px-4 py-2 rounded border text-sm"
            onClick={() => this.setState({ hasError: false })}
          >
            Reload Map
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
