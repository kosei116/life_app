import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Event } from '@life-app/types';
import { api } from '../../../lib/api-client';
import { toast } from '../../../components/Toast/toast-store';

export interface CreateEventPayload {
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  location?: string;
  description?: string;
  category?: string;
  color?: string;
  reminders?: number[];
  recurrence?:
    | { freq: 'daily'; count?: number; until?: string }
    | { freq: 'weekly'; weekdays: number[]; count?: number; until?: string }
    | { freq: 'monthly'; count?: number; until?: string };
}

export interface UpdateEventPayload {
  title?: string;
  start?: string;
  end?: string;
  all_day?: boolean;
  location?: string | null;
  description?: string | null;
  category?: string | null;
  color?: string | null;
  reminders?: number[];
  scope?: 'this' | 'this_and_future' | 'all';
}

const invalidateEvents = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ['events'] });

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventPayload) =>
      api.post<{ data: Event[] }>('/events', input as unknown as Record<string, unknown>),
    onSuccess: (res) => {
      toast.success(`予定を追加しました (${res.data.length}件)`);
      invalidateEvents(qc);
    },
    onError: (err: Error) => toast.error(`追加失敗: ${err.message}`),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateEventPayload & { id: string }) =>
      api.patch<{ data: { updated: number; ids: string[] } }>(
        `/events/${id}`,
        payload as unknown as Record<string, unknown>
      ),
    onSuccess: (res) => {
      toast.success(`更新しました (${res.data.updated}件)`);
      invalidateEvents(qc);
    },
    onError: (err: Error) => toast.error(`更新失敗: ${err.message}`),
  });
}

export interface OverridePayload {
  hidden?: boolean | null;
  color_override?: string | null;
  note?: string | null;
}

export function useUpsertOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: OverridePayload & { id: string }) =>
      api.put<{ data: { ok: true } }>(
        `/events/${id}/override`,
        payload as unknown as Record<string, unknown>
      ),
    onSuccess: () => {
      toast.success('表示設定を保存しました');
      invalidateEvents(qc);
    },
    onError: (err: Error) => toast.error(`保存失敗: ${err.message}`),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scope }: { id: string; scope?: 'this' | 'this_and_future' | 'all' }) => {
      const q = scope ? `?scope=${scope}` : '';
      return api.delete<{ data: { deleted: number } }>(`/events/${id}${q}`);
    },
    onSuccess: (res) => {
      toast.success(`削除しました (${res.data.deleted}件)`);
      invalidateEvents(qc);
    },
    onError: (err: Error) => toast.error(`削除失敗: ${err.message}`),
  });
}
