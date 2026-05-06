import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';
import type { TimetableSlot } from '../../lib/types.js';

export function useTimetable(semesterId: string | null) {
  return useQuery({
    queryKey: ['timetable', semesterId],
    queryFn: () =>
      api.get<{ data: TimetableSlot[] }>(`/timetable?semesterId=${semesterId}`).then((r) => r.data),
    enabled: !!semesterId,
  });
}

export function useUpsertSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      semesterId: string;
      dayOfWeek: number;
      periodId: string;
      subjectId: string;
    }) => api.put<{ data: TimetableSlot }>('/timetable', input).then((r) => r.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['timetable', vars.semesterId] }),
  });
}

export function useDeleteSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { semesterId: string; dayOfWeek: number; periodId: string }) =>
      api.delete<void>(
        `/timetable?semesterId=${input.semesterId}&dayOfWeek=${input.dayOfWeek}&periodId=${input.periodId}`
      ),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['timetable', vars.semesterId] }),
  });
}
