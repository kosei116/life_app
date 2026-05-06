import { useEffect, useMemo, useState } from 'react';
import type { Period, Subject, TimetableSlot } from '../../lib/types.js';
import { useUpsertSlot, useDeleteSlot } from './hooks.js';
import { useCreateSubject, useDeleteSubject } from '../subjects/hooks.js';

const DAYS = ['月', '火', '水', '木', '金'];

const SUBJECT_COLORS = [
  '#FFEBEE', '#FFF3E0', '#FFFDE7', '#F1F8E9', '#E8F5E9',
  '#E0F2F1', '#E1F5FE', '#E3F2FD', '#E8EAF6', '#F3E5F5',
  '#FCE4EC',
];

type Props = {
  semesterId: string;
  periods: Period[];
  subjects: Subject[];
  slots: TimetableSlot[];
  onClose: () => void;
};

// 5限×5曜日 (period_idx 0..4, day 0..4) の grid を name 文字列で持つ
type Grid = string[][];

export function TimetableEditorModal({ semesterId, periods, subjects, slots, onClose }: Props) {
  const upsertSlot = useUpsertSlot();
  const deleteSlot = useDeleteSlot();
  const createSubject = useCreateSubject();
  const deleteSubject = useDeleteSubject();

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const subjectByName = useMemo(() => {
    const m = new Map<string, Subject>();
    for (const s of subjects) m.set(s.name, s);
    return m;
  }, [subjects]);
  const displayPeriods = periods.slice(0, 5);

  // 初期 grid: 既存スロットから組み立て
  const [grid, setGrid] = useState<Grid>(() => {
    const g: Grid = Array.from({ length: 5 }, () => Array(5).fill(''));
    for (const sl of slots) {
      const pIdx = displayPeriods.findIndex((p) => p.id === sl.periodId);
      if (pIdx < 0 || sl.dayOfWeek > 4) continue;
      const sub = subjectMap.get(sl.subjectId);
      if (sub) g[pIdx]![sl.dayOfWeek] = sub.name;
    }
    return g;
  });

  // 既存スロットマップ（旧 (pIdx, day) → slotId? — but we just need slot existence by cell key）
  const slotByCell = useMemo(() => {
    const m = new Map<string, { slot: TimetableSlot; subjectName: string }>();
    for (const sl of slots) {
      const pIdx = displayPeriods.findIndex((p) => p.id === sl.periodId);
      if (pIdx < 0 || sl.dayOfWeek > 4) continue;
      const sub = subjectMap.get(sl.subjectId);
      m.set(`${pIdx}-${sl.dayOfWeek}`, { slot: sl, subjectName: sub?.name ?? '' });
    }
    return m;
  }, [slots, displayPeriods, subjectMap]);

  const [saving, setSaving] = useState(false);

  const setCell = (pIdx: number, day: number, value: string) => {
    setGrid((g) => g.map((row, i) => (i === pIdx ? row.map((c, j) => (j === day ? value : c)) : row)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 使用される科目名の集合（trim 後・空でないもの）
      const usedNames = new Set<string>();
      for (let p = 0; p < 5; p++) {
        for (let d = 0; d < 5; d++) {
          const name = (grid[p]![d] || '').trim();
          if (name) usedNames.add(name);
        }
      }

      // 不足している科目を作成（パレットから未使用色を割当）
      const usedColors = new Set(subjects.map((s) => s.color));
      const palette = SUBJECT_COLORS.filter((c) => !usedColors.has(c));
      const nameToSubject = new Map<string, Subject>(subjectByName);
      for (const name of usedNames) {
        if (nameToSubject.has(name)) continue;
        const color = palette.shift() ?? SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)]!;
        const created = await createSubject.mutateAsync({ semesterId, name, color });
        nameToSubject.set(name, created);
      }

      // 各セルを upsert または delete
      for (let p = 0; p < 5; p++) {
        const period = displayPeriods[p];
        if (!period) continue;
        for (let d = 0; d < 5; d++) {
          const newName = (grid[p]![d] || '').trim();
          const existing = slotByCell.get(`${p}-${d}`);

          if (newName) {
            const sub = nameToSubject.get(newName)!;
            if (!existing || existing.slot.subjectId !== sub.id) {
              await upsertSlot.mutateAsync({
                semesterId,
                dayOfWeek: d,
                periodId: period.id,
                subjectId: sub.id,
              });
            }
          } else {
            if (existing) {
              await deleteSlot.mutateAsync({
                semesterId,
                dayOfWeek: d,
                periodId: period.id,
              });
            }
          }
        }
      }

      // 時間割から外れた科目で、他に紐づきがないなら削除
      const stillUsedIds = new Set(
        Array.from(usedNames).map((n) => nameToSubject.get(n)!.id)
      );
      for (const sub of subjects) {
        if (!stillUsedIds.has(sub.id)) {
          await deleteSubject.mutateAsync(sub.id);
        }
      }

      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal" style={{ display: 'block' }} onClick={onClose}>
      <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title-row">
            <h2>Timetable Management</h2>
            <button className="modal-close-btn" onClick={onClose}>×</button>
          </div>
          <p>セルに科目名を直接入力。同じ名前は同じ科目として扱われます。</p>
        </div>

        <div className="modal-body">
          <div className="timetable-editor-container">
            <div className="timetable-editor">
              <div className="timetable-editor-header">
                <div className="timetable-editor-cell header"></div>
                {DAYS.map((d) => (
                  <div key={d} className="timetable-editor-cell header">{d}</div>
                ))}
              </div>
              {displayPeriods.map((p, pIdx) => (
                <div key={p.id} className="timetable-editor-row">
                  <div className="timetable-editor-cell header">{p.periodNumber}限</div>
                  {DAYS.map((_, d) => (
                    <div key={d} className="timetable-editor-cell editable">
                      <input
                        type="text"
                        className="timetable-input"
                        placeholder="科目名"
                        value={grid[pIdx]![d]}
                        onChange={(e) => setCell(pIdx, d, e.target.value)}
                        style={{ width: '100%', padding: 6, border: '1px solid #E0E0E0', borderRadius: 4 }}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="timetable-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
