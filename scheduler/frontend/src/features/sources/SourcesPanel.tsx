import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Source } from '@life-app/types';
import { Modal } from '../../components/Modal/Modal';
import { api } from '../../lib/api-client';
import { toast } from '../../components/Toast/toast-store';
import { useSources } from './useSources';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SourcesPanel({ open, onClose }: Props) {
  const { data: sources = [], isLoading } = useSources();
  const qc = useQueryClient();
  const patch = useMutation({
    mutationFn: ({ id, ...body }: Partial<Source> & { id: string }) =>
      api.patch<{ data: Source }>(`/sources/${id}`, body as Record<string, unknown>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sources'] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (e: Error) => toast.error(`更新失敗: ${e.message}`),
  });

  return (
    <Modal open={open} onClose={onClose} title="ソース管理">
      {isLoading && <div>読み込み中...</div>}
      <table className="sources-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>名前</th>
            <th>色</th>
            <th>有効</th>
            <th>優先度</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.id}>
              <td className="id-cell">{s.id}</td>
              <td>{s.name}</td>
              <td>
                <input
                  type="color"
                  value={s.color}
                  onChange={(e) => patch.mutate({ id: s.id, color: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) => patch.mutate({ id: s.id, enabled: e.target.checked })}
                />
              </td>
              <td>{s.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
