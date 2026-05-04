import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiFetch } from "@/lib/api";

export interface OperatorPreferences {
  selectedDroneId: string | null;
  cameraSettings?: Record<string, unknown> | null;
}

const KEY = ["/api/operator/preferences"] as const;

/**
 * Shared hook for the backend-owned operator preferences row. Use this in any
 * panel that needs to know the currently-selected drone, gimbal/camera prefs,
 * etc. so all consumers share the same TanStack cache and react to Settings
 * saves automatically.
 *
 * Uses apiFetch so the X-Session-Token header is attached — without it the
 * server returns 401 and the cache stays empty.
 */
export function useOperatorPreferences() {
  const query = useQuery<OperatorPreferences>({
    queryKey: KEY,
    queryFn: () => apiFetch<OperatorPreferences>("/api/operator/preferences"),
    staleTime: 30_000,
  });

  const update = useMutation({
    mutationFn: (patch: Partial<OperatorPreferences>) =>
      apiFetch<OperatorPreferences>("/api/operator/preferences", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  return {
    preferences: query.data,
    selectedDroneId: query.data?.selectedDroneId ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
    update: update.mutate,
    updateAsync: update.mutateAsync,
    isUpdating: update.isPending,
  };
}

export const operatorPreferencesQueryKey = KEY;
