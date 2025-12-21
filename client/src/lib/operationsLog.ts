// Operations Log Service for M.O.U.S.E. GCS
// Captures WebSocket messages, API calls, and system events
// Only active when Operations Console tab is open to save memory

export type LogType = 'websocket' | 'api' | 'system' | 'error';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: LogType;
  category: string;
  message: string;
  details?: any;
}

type LogSubscriber = (entries: LogEntry[]) => void;

class OperationsLogService {
  private entries: LogEntry[] = [];
  private subscribers: Set<LogSubscriber> = new Set();
  private isActive: boolean = false;
  private maxEntries: number = 500;
  private idCounter: number = 0;

  // Activate logging (called when Operations tab opens)
  activate(): void {
    this.isActive = true;
    this.addEntry('system', 'Console', 'Operations Console activated');
  }

  // Deactivate logging (called when Operations tab closes)
  deactivate(): void {
    this.isActive = false;
    // Keep only last 100 entries when inactive to save memory
    if (this.entries.length > 100) {
      this.entries = this.entries.slice(-100);
    }
  }

  // Check if logging is active
  isLoggingActive(): boolean {
    return this.isActive;
  }

  // Add a log entry
  addEntry(type: LogType, category: string, message: string, details?: any): void {
    // Always capture errors, otherwise only capture when active
    if (!this.isActive && type !== 'error') {
      return;
    }

    const entry: LogEntry = {
      id: `log_${++this.idCounter}_${Date.now()}`,
      timestamp: new Date(),
      type,
      category,
      message,
      details
    };

    this.entries.push(entry);

    // Trim to max entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Notify subscribers
    this.notifySubscribers();
  }

  // Log a WebSocket message
  logWebSocket(channel: string, data: any): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data).slice(0, 100);
    this.addEntry('websocket', channel, message, data);
  }

  // Log an API call
  logApi(method: string, endpoint: string, status: number, duration?: number): void {
    const message = `${method} ${endpoint} - ${status}${duration ? ` (${duration}ms)` : ''}`;
    this.addEntry('api', 'HTTP', message, { method, endpoint, status, duration });
  }

  // Log a system event
  logSystem(category: string, message: string, details?: any): void {
    this.addEntry('system', category, message, details);
  }

  // Log an error
  logError(category: string, message: string, error?: any): void {
    this.addEntry('error', category, message, error);
  }

  // Subscribe to log updates
  subscribe(callback: LogSubscriber): () => void {
    this.subscribers.add(callback);
    // Immediately send current entries
    callback([...this.entries]);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // Get all entries
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  // Clear all entries
  clear(): void {
    this.entries = [];
    this.notifySubscribers();
  }

  // Filter entries by type
  getEntriesByType(type: LogType): LogEntry[] {
    return this.entries.filter(e => e.type === type);
  }

  private notifySubscribers(): void {
    const entriesCopy = [...this.entries];
    this.subscribers.forEach(callback => callback(entriesCopy));
  }
}

// Singleton instance
export const operationsLog = new OperationsLogService();

// Helper hook for React components
export function useOperationsLog() {
  return operationsLog;
}
