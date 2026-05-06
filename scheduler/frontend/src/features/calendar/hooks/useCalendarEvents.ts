import { useQuery } from '@tanstack/react-query';
import type { Event } from '@life-app/types';
import { api } from '../../../lib/api-client';

interface Range {
  from: Date;
  to: Date;
}

export function useCalendarEvents({ from, to }: Range) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  return useQuery({
    queryKey: ['events', fromIso, toIso],
    queryFn: async () => {
      const params = new URLSearchParams({ from: fromIso, to: toIso });
      const res = await api.get<{ data: Event[] }>(`/events?${params}`);
      return res.data;
    },
  });
}
