import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';
import type { ClassDay } from '../../lib/types.js';

export function useClassDays(semesterId: string | null) {
  return useQuery({
    queryKey: ['class-days', semesterId],
    queryFn: () =>
      api.get<{ data: ClassDay[] }>(`/class-days?semesterId=${semesterId}`).then((r) => r.data),
    enabled: !!semesterId,
  });
}

export function useToggleClassDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ semesterId, date }: { semesterId: string; date: string }) =>
      api.post<{ data: { date: string; exists: boolean } }>('/class-days/toggle', { semesterId, date })
         .then((r) => r.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['class-days', vars.semesterId] }),
  });
}

export function useWeekdayBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      semesterId: string;
      year: number;
      month: number;
      jsWeekday: number;
      setHoliday: boolean;
    }) =>
      api.post<{ data: { affected: number } }>('/class-days/weekday-bulk', input).then((r) => r.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['class-days', vars.semesterId] }),
  });
}

export function useResetClassDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (semesterId: string) =>
      api.post<{ data: { count: number } }>(`/class-days/reset/${semesterId}`).then((r) => r.data),
    onSuccess: (_, semesterId) => qc.invalidateQueries({ queryKey: ['class-days', semesterId] }),
  });
}

export function useReplaceClassDays(semesterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dates: string[]) =>
      api.put<{ data: ClassDay[] }>(`/class-days/bulk/${semesterId}`, dates).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class-days', semesterId] }),
  });
}
