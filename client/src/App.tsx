import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

const IGNORABLE_ERRORS = [
  "_leaflet_pos",
  "_leaflet_id",
  "Map container",
  "ResizeObserver loop",
];

function isIgnorableError(error: Error | string): boolean {
  const msg = typeof error === "string" ? error : error?.message || "";
  return IGNORABLE_ERRORS.some((pattern) => msg.includes(pattern));
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    if (isIgnorableError(error)) {
      return { hasError: false, message: "" };
    }
    return { hasError: true, message: error?.message || "Unknown application error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isIgnorableError(error)) return;
    console.error("App runtime error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground p-6 flex items-center justify-center">
          <div className="max-w-2xl w-full border border-destructive/50 rounded-lg p-6 bg-card">
            <h1 className="text-xl font-bold text-destructive">Application Runtime Error</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              The app hit an unexpected error and could not render.
            </p>
            <pre className="mt-4 text-xs bg-muted p-3 rounded overflow-auto">
              {this.state.message}
            </pre>
            <div className="mt-4 flex gap-2">
              <button
                className="px-3 py-2 rounded bg-primary text-primary-foreground text-sm"
                onClick={() => window.location.reload()}
              >
                Reload App
              </button>
              <button
                className="px-3 py-2 rounded border border-border text-sm"
                onClick={() => {
                  localStorage.removeItem("mouse_gcs_session");
                  localStorage.removeItem("mouse_selected_drone");
                  window.location.reload();
                }}
              >
                Reset Session + Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('mouse_theme') || 'dark';
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme?: string }>;
      const theme = customEvent.detail?.theme;
      if (theme === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    };
    
    window.addEventListener('gui-config-changed', handleThemeChange);
    return () => window.removeEventListener('gui-config-changed', handleThemeChange);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppErrorBoundary>
          <Toaster />
          <Router />
        </AppErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
