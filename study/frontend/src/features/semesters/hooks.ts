import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';
import type { Semester } from '../../lib/types.js';

export function useSemesters() {
  return useQuery({
    queryKey: ['semesters'],
    queryFn: () => api.get<{ data: Semester[] }>('/semesters').then((r) => r.data),
  });
}

export function useCreateSemester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; startDate: string; endDate: string; isCurrent?: boolean }) =>
      api.post<{ data: Semester }>('/semesters', input).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['semesters'] }),
  });
}

export function useUpdateSemester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Semester> & { id: string }) =>
      api.patch<{ data: Semester }>(`/semesters/${id}`, patch).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['semesters'] }),
  });
}

export function useDeleteSemester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/semesters/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['semesters'] }),
  });
}
