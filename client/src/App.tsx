import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TelemetryProvider } from "@/contexts/TelemetryContext";
import { AppStateProvider } from "@/contexts/AppStateContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";
import { clearStoredSelectedDrone, clearStoredSession } from "@/lib/clientState";
import { migrateLegacyLocalStorageKeys } from "@/hooks/useAppConfig";
import { installLocalStorageMirror, installAppConfigBridge } from "@/lib/centralConfig";
import { GlobalAudioReceiver } from "@/components/audio/GlobalAudioReceiver";

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
                  clearStoredSession();
                  clearStoredSelectedDrone();
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
    // Bootstrap: read theme from localStorage (offline fallback) so the page
    // doesn't flash. The unified app-config snapshot will overwrite this once
    // the GET /api/app-config response lands (handled by the listener below).
    const savedTheme = localStorage.getItem('mouse_theme') || 'dark';
    const applyTheme = (theme: string) => {
      if (theme === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    };
    applyTheme(savedTheme);

    // Local in-tab theme changes (legacy event, still emitted by GUIConfigPanel
    // when the operator picks a new theme from the dropdown).
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme?: string }>;
      const theme = customEvent.detail?.theme;
      if (theme === 'light' || theme === 'dark') applyTheme(theme);
    };
    window.addEventListener('gui-config-changed', handleThemeChange);

    // Cross-instance / WS-driven theme changes: TopBar dispatches
    // `app-config-updated` for every centralized key. We react only to ui.theme.
    const handleAppConfig = (e: Event) => {
      const detail = (e as CustomEvent<{ key?: string; value?: unknown }>).detail;
      if (detail?.key === 'ui.theme' && (detail.value === 'light' || detail.value === 'dark')) {
        applyTheme(String(detail.value));
        try { localStorage.setItem('mouse_theme', String(detail.value)); } catch {}
      }
    };
    window.addEventListener('app-config-updated', handleAppConfig);

    // Install the global write-through bridges:
    //   • localStorage.setItem(<legacy_key>, ...) → also PUT /api/app-config
    //   • app-config-updated WS event → also localStorage.setItem + legacy event
    // This means existing panels keep working unchanged AND every change is
    // mirrored to the central backend (Postgres + Firebase RTBD) AND every
    // connected GCS reflects the change live.
    installLocalStorageMirror();
    installAppConfigBridge();

    // Best-effort: copy any legacy localStorage entries up to the central
    // store on first start. Subsequent runs are a no-op.
    void migrateLegacyLocalStorageKeys();

    return () => {
      window.removeEventListener('gui-config-changed', handleThemeChange);
      window.removeEventListener('app-config-updated', handleAppConfig);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppStateProvider>
        <TooltipProvider>
          <TelemetryProvider>
            <AppErrorBoundary>
              <Toaster />
              <SonnerToaster richColors closeButton position="top-right" />
              <GlobalAudioReceiver />
              <Router />
            </AppErrorBoundary>
          </TelemetryProvider>
        </TooltipProvider>
      </AppStateProvider>
    </QueryClientProvider>
  );
}

export default App;
