import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';
import type { Task, TaskType } from '../../lib/types.js';

export function useTasks(params: { semesterId?: string | null; subjectId?: string | null; completed?: boolean }) {
  const qs = new URLSearchParams();
  if (params.semesterId) qs.set('semesterId', params.semesterId);
  if (params.subjectId) qs.set('subjectId', params.subjectId);
  if (params.completed !== undefined) qs.set('completed', String(params.completed));
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () =>
      api.get<{ data: Task[] }>(`/tasks?${qs.toString()}`).then((r) => r.data),
    enabled: !!params.semesterId,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      semesterId: string;
      subjectId?: string | null;
      type: TaskType;
      title: string;
      detail?: string;
      dueDate: string;
    }) => api.post<{ data: Task }>('/tasks', input).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Task> & { id: string }) =>
      api.patch<{ data: Task }>(`/tasks/${id}`, patch).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
