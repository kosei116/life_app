import { useState, useMemo } from 'react';
import type { Shift, Workplace } from '../../lib/types.js';
import { useCreateShift, useUpdateShift, useDeleteShift, useShifts } from './hooks.js';
import { ymd, pad } from '../../lib/utils.js';

type Props = {
  initial: { date?: string; shift?: Shift };
  workplaces: Workplace[];
  onClose: () => void;
};

function buildLocal(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y!, m! - 1, d!, hh!, mm!);
}

export function ShiftModal({ initial, workplaces, onClose }: Props) {
  const editing = !!initial.shift;
  const create = useCreateShift();
  const update = useUpdateShift();
  const del = useDeleteShift();

  const initStart = initial.shift ? new Date(initial.shift.startAt) : null;
  const initEnd = initial.shift ? new Date(initial.shift.endAt) : null;
  const initDate = initial.shift ? ymd(initStart!) : (initial.date ?? ymd(new Date()));

  const [date, setDate] = useState(initDate);
  const [start, setStart] = useState(
    initStart ? `${pad(initStart.getHours())}:${pad(initStart.getMinutes())}` : '09:00'
  );
  const [end, setEnd] = useState(
    initEnd ? `${pad(initEnd.getHours())}:${pad(initEnd.getMinutes())}` : '17:00'
  );
  const [workplaceId, setWorkplaceId] = useState(
    initial.shift?.workplaceId ?? workplaces[0]?.id ?? ''
  );

  // 履歴サジェスト: 直近の (start, end, workplaceId) ユニーク Top 10
  const { data: pastShifts = [] } = useShifts({});
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const list: { start: string; end: string; workplaceId: string }[] = [];
    const sorted = [...pastShifts].sort((a, b) => b.startAt.localeCompare(a.startAt));
    for (const s of sorted) {
      const sd = new Date(s.startAt);
      const ed = new Date(s.endAt);
      const sk = `${pad(sd.getHours())}:${pad(sd.getMinutes())}-${pad(ed.getHours())}:${pad(ed.getMinutes())}-${s.workplaceId}`;
      if (seen.has(sk)) continue;
      seen.add(sk);
      list.push({
        start: `${pad(sd.getHours())}:${pad(sd.getMinutes())}`,
        end: `${pad(ed.getHours())}:${pad(ed.getMinutes())}`,
        workplaceId: s.workplaceId,
      });
      if (list.length >= 10) break;
    }
    return list;
  }, [pastShifts]);

  const wpMap = new Map(workplaces.map((w) => [w.id, w]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workplaceId) return;
    const sDate = buildLocal(date, start);
    const eDate = buildLocal(date, end);
    if (eDate <= sDate) eDate.setDate(eDate.getDate() + 1);
    const payload = {
      workplaceId,
      startAt: sDate.toISOString(),
      endAt: eDate.toISOString(),
    };
    if (editing && initial.shift) {
      await update.mutateAsync({ id: initial.shift.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!editing || !initial.shift) return;
    if (!confirm('このシフトを削除しますか？')) return;
    await del.mutateAsync(initial.shift.id);
    onClose();
  };

  return (
    <div className="modal show" role="dialog" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editing ? 'シフトを編集' : 'シフトを追加'}</h2>
          <button className="close-btn" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <form className="event-form" onSubmit={submit}>
          <div className="form-section main-section">
            <input type="hidden" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="form-row compact-row">
              <div className="form-group compact">
                <label htmlFor="shiftStart">開始時間 *</label>
                <input
                  id="shiftStart"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </div>
              <div className="form-group compact">
                <label htmlFor="shiftEnd">終了時間 *</label>
                <input
                  id="shiftEnd"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="shiftDate">日付 *</label>
              <input
                id="shiftDate"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="shiftWorkplace">職場 *</label>
              <select
                id="shiftWorkplace"
                value={workplaceId}
                onChange={(e) => setWorkplaceId(e.target.value)}
                required
              >
                <option value="">選択してください</option>
                {workplaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}（¥{w.hourlyRate}/h）</option>
                ))}
              </select>
            </div>
          </div>

          {suggestions.length > 0 && !editing && (
            <div className="form-section history-section">
              <div className="form-group">
                <label>入力履歴</label>
                <div className="time-history-container">
                  {suggestions.map((s, i) => {
                    const wp = wpMap.get(s.workplaceId);
                    return (
                      <div
                        key={i}
                        className="time-history-item"
                        onClick={() => {
                          setStart(s.start);
                          setEnd(s.end);
                          setWorkplaceId(s.workplaceId);
                        }}
                      >
                        <div className="time-history-workplace">{wp?.name ?? '?'}</div>
                        <div className="time-history-time-range">
                          {s.start} - {s.end}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">保存</button>
            {editing && (
              <button type="button" className="btn btn-danger" onClick={handleDelete}>削除</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
