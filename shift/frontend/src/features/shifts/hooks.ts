import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';
import type { Shift } from '../../lib/types.js';

export function useShifts(params: { from?: string; to?: string; workplaceId?: string }) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.workplaceId) qs.set('workplaceId', params.workplaceId);
  return useQuery({
    queryKey: ['shifts', params],
    queryFn: () =>
      api.get<{ data: Shift[] }>(`/shifts?${qs.toString()}`).then((r) => r.data),
  });
}

export function useCreateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      workplaceId: string;
      startAt: string;
      endAt: string;
      rateOverride?: number | null;
      notes?: string | null;
    }) => api.post<{ data: Shift }>('/shifts', input).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      qc.invalidateQueries({ queryKey: ['income'] });
    },
  });
}

export function useUpdateShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<Shift>) =>
      api.patch<{ data: Shift }>(`/shifts/${id}`, patch).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      qc.invalidateQueries({ queryKey: ['income'] });
    },
  });
}

export function useDeleteShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/shifts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      qc.invalidateQueries({ queryKey: ['income'] });
    },
  });
}
