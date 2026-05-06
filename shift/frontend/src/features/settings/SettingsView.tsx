import { useState } from 'react';
import {
  useWorkplaces,
  useCreateWorkplace,
  useUpdateWorkplace,
  useDeleteWorkplace,
} from '../workplaces/hooks.js';
import type { Workplace } from '../../lib/types.js';

const COLORS: { color: string; title: string }[] = [
  { color: '#3b82f6', title: '青' },
  { color: '#10b981', title: '緑' },
  { color: '#f59e0b', title: '黄' },
  { color: '#ef4444', title: '赤' },
  { color: '#8b5cf6', title: '紫' },
  { color: '#ec4899', title: 'ピンク' },
  { color: '#06b6d4', title: 'シアン' },
  { color: '#84cc16', title: 'ライム' },
  { color: '#f97316', title: 'オレンジ' },
  { color: '#6366f1', title: 'インディゴ' },
  { color: '#64748b', title: 'グレー' },
  { color: '#1f2937', title: '黒' },
];

export function SettingsView() {
  const { data: workplaces = [] } = useWorkplaces();
  const create = useCreateWorkplace();
  const update = useUpdateWorkplace();
  const del = useDeleteWorkplace();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Workplace | null>(null);
  const [form, setForm] = useState({
    name: '',
    color: COLORS[0]!.color,
    hourlyRate: 1100,
  });

  const startCreate = () => {
    setEditing(null);
    const used = new Set(workplaces.map((w) => w.color));
    const c = COLORS.find((c) => !used.has(c.color))?.color ?? COLORS[0]!.color;
    setForm({ name: '', color: c, hourlyRate: 1100 });
    setShowForm(true);
  };

  const startEdit = (w: Workplace) => {
    setEditing(w);
    setForm({ name: w.name, color: w.color, hourlyRate: w.hourlyRate });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) {
      await update.mutateAsync({ id: editing.id, ...form });
    } else {
      await create.mutateAsync(form);
    }
    setShowForm(false);
  };

  const colorTitle = (c: string) => COLORS.find((x) => x.color === c)?.title ?? c;

  return (
    <div className="settings-content">
      <h2>職場設定</h2>
      <div className="workplaces-list">
        {workplaces.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
            職場が未登録です
          </div>
        )}
        {workplaces.map((w) => (
          <div key={w.id} className="workplace-item">
            <div className="workplace-info">
              <div className="workplace-name">{w.name}</div>
              <div className="workplace-rate">時給: ¥{w.hourlyRate.toLocaleString()}</div>
              <div className="workplace-color" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    display: 'inline-block', width: 14, height: 14,
                    background: w.color, borderRadius: 3, border: '1px solid var(--border-color)',
                  }}
                />
                {colorTitle(w.color)}
              </div>
            </div>
            <div className="workplace-actions">
              <button className="btn btn-secondary" onClick={() => startEdit(w)}>編集</button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (confirm(`「${w.name}」を削除？関連シフトも削除されます。`)) {
                    del.mutate(w.id);
                  }
                }}
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" onClick={startCreate}>職場を追加</button>

      {showForm && (
        <div className="modal show" role="dialog" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? '職場を編集' : '職場を追加'}</h2>
              <button className="close-btn" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form className="event-form" onSubmit={submit}>
              <div className="form-section main-section">
                <div className="form-group">
                  <label htmlFor="wpName">職場名 *</label>
                  <input
                    id="wpName"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    maxLength={100}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="wpRate">時給（円） *</label>
                  <input
                    id="wpRate"
                    type="number"
                    min={0}
                    value={form.hourlyRate}
                    onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="form-group">
                  <div className="form-group-header">
                    <span className="form-group-title">色</span>
                  </div>
                  <div className="color-picker-container">
                    <div className="color-palette">
                      {COLORS.map((c) => (
                        <button
                          key={c.color}
                          type="button"
                          className="color-option"
                          title={c.title}
                          aria-pressed={form.color === c.color}
                          onClick={() => setForm({ ...form, color: c.color })}
                          style={{
                            outline: form.color === c.color ? '3px solid var(--primary-color)' : 'none',
                            outlineOffset: 2,
                          }}
                        >
                          <span className="color-swatch" style={{ backgroundColor: c.color }} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">保存</button>
                {editing && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      if (confirm(`「${editing.name}」を削除？`)) {
                        del.mutate(editing.id);
                        setShowForm(false);
                      }
                    }}
                  >
                    削除
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
