/**
 * Centralized API error reporting. Use in catch blocks for consistent user feedback.
 */
import { toast } from "sonner";

export function reportApiError(
  error: unknown,
  fallbackMessage = "Request failed"
): void {
  const message =
    error instanceof Error ? error.message : String(error ?? fallbackMessage);
  console.error("[API]", message);
  toast.error(message);
}
