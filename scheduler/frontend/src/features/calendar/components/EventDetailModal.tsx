import { useState, type CSSProperties } from 'react';
import type { Event } from '@life-app/types';
import { Modal } from '../../../components/Modal/Modal';
import { formatJst } from '../../../lib/date-utils';
import { DisplayFieldRenderer } from './DisplayFieldRenderer';
import { useDeleteEvent } from '../hooks/useEventMutations';

interface Props {
  open: boolean;
  onClose: () => void;
  event: Event | null;
  onEdit: (event: Event) => void;
}

export function EventDetailModal({ open, onClose, event, onEdit }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteScope, setDeleteScope] = useState<'this' | 'this_and_future' | 'all'>('this');
  const del = useDeleteEvent();

  if (!event) return null;

  const isRecurring = event.recurrence_group_id !== null;
  const isImported = event.source !== 'manual';
  const isReadOnly = isImported && event.source !== 'google';
  const display = event.metadata?.display;

  const handleDelete = async () => {
    try {
      await del.mutateAsync({ id: event.id, scope: isRecurring ? deleteScope : undefined });
      onClose();
      setConfirmingDelete(false);
    } catch {
      /* toast already shown */
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event.title}
      footer={
        <>
          {!confirmingDelete && (
            <>
              <button className="btn" onClick={onClose}>閉じる</button>
              {!isReadOnly && (
                <>
                  <button
                    className="btn btn-danger"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={del.isPending}
                  >
                    削除
                  </button>
                  <button className="btn btn-primary" onClick={() => onEdit(event)}>
                    編集
                  </button>
                </>
              )}
            </>
          )}
          {confirmingDelete && (
            <>
              <button className="btn" onClick={() => setConfirmingDelete(false)} disabled={del.isPending}>
                やめる
              </button>
              <button
                className="btn btn-danger-solid"
                onClick={handleDelete}
                disabled={del.isPending}
              >
                {del.isPending ? '削除中...' : '削除する'}
              </button>
            </>
          )}
        </>
      }
    >
      {confirmingDelete ? (
        <div>
          <p style={{ marginTop: 0 }}>本当に削除しますか？</p>
          {isRecurring && (
            <label className="field">
              <span className="field-label">削除範囲</span>
              <select
                value={deleteScope}
                onChange={(e) => setDeleteScope(e.target.value as typeof deleteScope)}
              >
                <option value="this">このイベントのみ</option>
                <option value="this_and_future">これ以降すべて</option>
                <option value="all">すべて</option>
              </select>
            </label>
          )}
        </div>
      ) : (
        <div>
          <Row label="期間">
            {event.all_day
              ? `${formatJst(event.start_at, 'yyyy-MM-dd')}（終日）`
              : `${formatJst(event.start_at, 'yyyy-MM-dd HH:mm')} 〜 ${formatJst(event.end_at, 'HH:mm')}`}
          </Row>
          <Row label="ソース">
            <span
              className="source-tag"
              style={{ ['--tag-color' as string]: event.color ?? '#6b7280' } as CSSProperties}
            >
              {event.source}
            </span>
            {isReadOnly && (
              <span style={{ marginLeft: 6, fontSize: 'var(--fs-xs)', color: 'var(--c-text-muted)' }}>
                (読み取り専用)
              </span>
            )}
          </Row>
          {event.location && <Row label="場所">{event.location}</Row>}
          {event.description && (
            <Row label="メモ">
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
                {event.description}
              </pre>
            </Row>
          )}

          {display?.fields && display.fields.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--c-border)' }}>
              {display.fields.map((f, i) => (
                <DisplayFieldRenderer key={i} field={f} />
              ))}
            </div>
          )}

          {display?.actions && display.actions.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {display.actions.map((a, i) => (
                <a
                  key={i}
                  className="btn btn-sm"
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  {a.label}
                </a>
              ))}
            </div>
          )}

        </div>
      )}
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail-row">
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children}</div>
    </div>
  );
}
