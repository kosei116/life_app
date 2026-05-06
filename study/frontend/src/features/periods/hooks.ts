import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';
import type { Period } from '../../lib/types.js';

export function usePeriods(semesterId: string | null) {
  return useQuery({
    queryKey: ['periods', semesterId],
    queryFn: () =>
      api.get<{ data: Period[] }>(`/periods?semesterId=${semesterId}`).then((r) => r.data),
    enabled: !!semesterId,
  });
}

export function useReplacePeriods(semesterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periods: { periodNumber: number; startTime: string; endTime: string }[]) =>
      api.put<{ data: Period[] }>(`/periods/bulk/${semesterId}`, periods).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods', semesterId] });
      qc.invalidateQueries({ queryKey: ['timetable', semesterId] });
    },
  });
}
