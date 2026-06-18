import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError, setSerialRequests } from "./api";

export const keys = {
  config: ["config"] as const,
  me: ["me"] as const,
  groups: ["groups"] as const,
  group: (id: string) => ["group", id] as const,
  expenses: (id: string) => ["group", id, "expenses"] as const,
  balances: (id: string) => ["group", id, "balances"] as const,
  activity: (id: string) => ["group", id, "activity"] as const,
};

export const useConfig = () =>
  useQuery({
    queryKey: keys.config,
    queryFn: async () => {
      const config = await api.config();
      setSerialRequests(config.demo);
      return config;
    },
    staleTime: Infinity,
  });

/** The signed-in user, or null when signed out (a 401 is an answer, not an error). */
export const useMe = () =>
  useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });

export const useGroups = () => useQuery({ queryKey: keys.groups, queryFn: api.groups });
export const useGroup = (id: string) => useQuery({ queryKey: keys.group(id), queryFn: () => api.group(id) });
export const useExpenses = (id: string) => useQuery({ queryKey: keys.expenses(id), queryFn: () => api.expenses(id) });
export const useBalances = (id: string) => useQuery({ queryKey: keys.balances(id), queryFn: () => api.balances(id) });
export const useActivity = (id: string) => useQuery({ queryKey: keys.activity(id), queryFn: () => api.activity(id) });

/** After any change inside a group, everything about that group (and the overview) is stale. */
export function useInvalidateGroup() {
  const client = useQueryClient();
  return (groupId: string) =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["group", groupId] }),
      client.invalidateQueries({ queryKey: keys.groups }),
    ]);
}

export function useRecordSettlement(groupId: string) {
  const invalidate = useInvalidateGroup();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.recordSettlement>[1]) => api.recordSettlement(groupId, input),
    onSuccess: () => invalidate(groupId),
  });
}

export function useDeleteExpense(groupId: string) {
  const invalidate = useInvalidateGroup();
  return useMutation({
    mutationFn: (id: string) => api.deleteExpense(groupId, id),
    onSuccess: () => invalidate(groupId),
  });
}
