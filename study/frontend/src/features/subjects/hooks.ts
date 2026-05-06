import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';
import type { Subject } from '../../lib/types.js';

export function useSubjects(semesterId: string | null) {
  return useQuery({
    queryKey: ['subjects', semesterId],
    queryFn: () =>
      api.get<{ data: Subject[] }>(`/subjects?semesterId=${semesterId}`).then((r) => r.data),
    enabled: !!semesterId,
  });
}

export function useCreateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { semesterId: string; name: string; color: string; totalLectures?: number | null }) =>
      api.post<{ data: Subject }>('/subjects', input).then((r) => r.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['subjects', vars.semesterId] }),
  });
}

export function useUpdateSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Subject> & { id: string }) =>
      api.patch<{ data: Subject }>(`/subjects/${id}`, patch).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subjects'] }),
  });
}

export function useDeleteSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/subjects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subjects'] }),
  });
}

export function useAdjustLecturesAttended() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      api.post<{ data: Subject }>(`/subjects/${id}/lectures-attended`, { delta }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subjects'] }),
  });
}
