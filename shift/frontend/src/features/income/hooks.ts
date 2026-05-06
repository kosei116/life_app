import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';
import type { IncomeMonth, IncomeYear } from '../../lib/types.js';

export function useIncomeMonth(yearMonth: string) {
  return useQuery({
    queryKey: ['income', 'month', yearMonth],
    queryFn: () =>
      api.get<{ data: IncomeMonth }>(`/income/month?yearMonth=${yearMonth}`).then((r) => r.data),
  });
}

export function useIncomeYear(year: number) {
  return useQuery({
    queryKey: ['income', 'year', year],
    queryFn: () =>
      api.get<{ data: IncomeYear }>(`/income/year?year=${year}`).then((r) => r.data),
  });
}

export function useUpdateMonthlyTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { yearMonth: string; amount: number }) =>
      api.put<{ data: { yearMonth: string; amount: number } }>('/income/target', input)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['income'] }),
  });
}
