import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';
import type { Workplace } from '../../lib/types.js';

export function useWorkplaces() {
  return useQuery({
    queryKey: ['workplaces'],
    queryFn: () => api.get<{ data: Workplace[] }>('/workplaces').then((r) => r.data),
  });
}

export function useCreateWorkplace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color: string; hourlyRate: number }) =>
      api.post<{ data: Workplace }>('/workplaces', input).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workplaces'] }),
  });
}

export function useUpdateWorkplace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<Workplace>) =>
      api.patch<{ data: Workplace }>(`/workplaces/${id}`, patch).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workplaces'] }),
  });
}

export function useDeleteWorkplace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/workplaces/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workplaces'] }),
  });
}
