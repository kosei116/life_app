import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { toast } from '../../components/Toast/toast-store';

interface PushResult {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

interface PullResult {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
}

export function useSync() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const push = await api.post<{ data: PushResult }>('/sync/push');
      const pull = await api.post<{ data: PullResult }>('/sync/pull');
      return { push: push.data, pull: pull.data };
    },
    onSuccess: ({ push, pull }) => {
      toast.success(
        `同期完了: push ${push.succeeded}/${push.attempted}, pull 新規${pull.created} 更新${pull.updated}`
      );
      qc.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (err) => {
      toast.error(`同期失敗: ${err instanceof Error ? err.message : '不明なエラー'}`);
    },
  });
}
