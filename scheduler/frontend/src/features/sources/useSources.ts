import { useQuery } from '@tanstack/react-query';
import type { Source } from '@life-app/types';
import { api } from '../../lib/api-client';

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: async () => {
      const res = await api.get<{ data: Source[] }>('/sources');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}
