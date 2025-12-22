import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 60000, // Data considered fresh for 1 minute
      cacheTime: 300000, // Cache unused queries for 5 minutes (v4 syntax)
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Memory management utilities
export const MEMORY_LIMITS = {
  MAX_LOG_ENTRIES: 500,
  MAX_MESSAGES: 200,
  MAX_TELEMETRY_HISTORY: 100,
  MAX_FLIGHT_SESSIONS: 50,
};

// Debounce utility for localStorage writes
const debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

export function debouncedLocalStorageSet(key: string, value: string, delay: number = 500): void {
  // Guard for non-browser environments (Electron main process, SSR, tests)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  
  const existingTimer = debounceTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  
  const timer = setTimeout(() => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Handle quota exceeded or serialization errors silently
      console.warn('localStorage write failed:', e);
    }
    debounceTimers.delete(key);
  }, delay);
  
  debounceTimers.set(key, timer);
}

// Trim array to limit with FIFO behavior
export function trimToLimit<T>(arr: T[], limit: number): T[] {
  if (arr.length <= limit) return arr;
  return arr.slice(-limit);
}
