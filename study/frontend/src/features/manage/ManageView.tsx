import { useState } from 'react';
import { useAppStore } from '../../lib/store.js';
import {
  useSemesters, useCreateSemester, useUpdateSemester, useDeleteSemester,
} from '../semesters/hooks.js';
import { ClassDaysModal } from '../class-days/ClassDaysModal.js';
import { TimetableEditorModal } from '../timetable/TimetableEditorModal.js';
import { usePeriods } from '../periods/hooks.js';
import { useSubjects } from '../subjects/hooks.js';
import { useTimetable } from '../timetable/hooks.js';
import type { Semester } from '../../lib/types.js';

export function ManageView() {
  const { data: semesters = [] } = useSemesters();
  const currentId = useAppStore((s) => s.currentSemesterId);
  const setCurrentId = useAppStore((s) => s.setCurrentSemesterId);
  const createSem = useCreateSemester();
  const updateSem = useUpdateSemester();
  const deleteSem = useDeleteSemester();
  const [showForm, setShowForm] = useState(false);
  const [classDaysFor, setClassDaysFor] = useState<Semester | null>(null);
  const [timetableFor, setTimetableFor] = useState<Semester | null>(null);
  const { data: editingPeriods = [] } = usePeriods(timetableFor?.id ?? null);
  const { data: editingSubjects = [] } = useSubjects(timetableFor?.id ?? null);
  const { data: editingSlots = [] } = useTimetable(timetableFor?.id ?? null);
  const [form, setForm] = useState({
    name: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    isCurrent: true,
  });

  const handleCreate = async () => {
    if (!form.name || !form.startDate || !form.endDate) return;
    const created = await createSem.mutateAsync(form);
    if (form.isCurrent) setCurrentId(created.id);
    setForm({ ...form, name: '', endDate: '' });
    setShowForm(false);
  };

  return (
    <div className="manage-container">
      <section className="manage-section">
        <h2 className="manage-section-title">Semester Management</h2>
        <div className="manage-actions">
          <button className="btn primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'キャンセル' : '+ Add Semester'}
          </button>
        </div>

        {showForm && (
          <div className="semester-card" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label>名前</label>
              <input
                type="text"
                value={form.name}
                placeholder="2026年度 春学期"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>開始日</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>終了日</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.isCurrent}
                onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })}
              />
              現在の学期にする
            </label>
            <div style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={handleCreate}>作成</button>
            </div>
          </div>
        )}

        {semesters.length === 0 ? (
          <div className="empty-message">学期が未登録です</div>
        ) : (
          <div className="semesters-list">
            {semesters.map((s) => (
              <div key={s.id} className={`semester-card${currentId === s.id ? ' active' : ''}`}>
                <div className="semester-card-header">
                  <h3 className="semester-name">{s.name}</h3>
                  {s.isCurrent && <span className="current-badge">Current</span>}
                </div>
                <div className="semester-card-body">
                  <div className="semester-info">
                    <span className="info-label">開始</span>
                    <span className="info-value">{s.startDate}</span>
                  </div>
                  <div className="semester-info">
                    <span className="info-label">終了</span>
                    <span className="info-value">{s.endDate}</span>
                  </div>
                </div>
                <div className="semester-card-actions">
                  {(currentId !== s.id || !s.isCurrent) && (
                    <button
                      className="btn-small btn-select"
                      onClick={async () => {
                        if (!s.isCurrent) {
                          await updateSem.mutateAsync({ id: s.id, isCurrent: true });
                        }
                        setCurrentId(s.id);
                      }}
                    >
                      選択
                    </button>
                  )}
                  <button className="btn-small" onClick={() => setClassDaysFor(s)}>
                    Class Days
                  </button>
                  <button className="btn-small" onClick={() => setTimetableFor(s)}>
                    Timetable
                  </button>
                  <button
                    className="btn-small btn-delete"
                    onClick={() => {
                      if (confirm(`「${s.name}」を削除？関連データも全て削除されます。`)) {
                        deleteSem.mutate(s.id);
                        if (currentId === s.id) setCurrentId(null);
                      }
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {classDaysFor && (
        <ClassDaysModal semester={classDaysFor} onClose={() => setClassDaysFor(null)} />
      )}
      {timetableFor && editingPeriods.length > 0 && (
        <TimetableEditorModal
          semesterId={timetableFor.id}
          periods={editingPeriods}
          subjects={editingSubjects}
          slots={editingSlots}
          onClose={() => setTimetableFor(null)}
        />
      )}
    </div>
  );
}
