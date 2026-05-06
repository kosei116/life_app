import { useState } from 'react';
import type { Subject, Task, TaskType } from '../../lib/types.js';
import { useUpsertSlot } from './hooks.js';
import {
  useCreateSubject,
  useAdjustLecturesAttended,
  useUpdateSubject,
} from '../subjects/hooks.js';
import { useCreateTask } from '../tasks/hooks.js';
import { playCelebrate, triggerRipple, PALETTE_GREEN } from '../../lib/animations.js';
import { formatDueDate, formatDateLocal } from '../../lib/stats.js';

const SUBJECT_COLORS = [
  '#FFEBEE', '#FFF3E0', '#FFFDE7', '#F1F8E9', '#E8F5E9',
  '#E0F2F1', '#E1F5FE', '#E3F2FD', '#E8EAF6', '#F3E5F5',
  '#FCE4EC',
];

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'report', label: 'Report' },
  { value: 'test', label: 'Test' },
];

type Props = {
  semesterId: string;
  dayOfWeek: number;
  periodId: string;
  subjects: Subject[];
  tasks: Task[];
  currentSubjectId: string | null;
  onClose: () => void;
};

function evalText(subject: Subject | undefined): string {
  if (!subject || !subject.evaluation) return '';
  const ev = subject.evaluation as { displayText?: string };
  return typeof ev === 'object' && 'displayText' in ev ? String(ev.displayText ?? '') : '';
}

export function SubjectModal({
  semesterId, dayOfWeek, periodId, subjects, tasks, currentSubjectId, onClose,
}: Props) {
  const upsertSlot = useUpsertSlot();
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const adjustLectures = useAdjustLecturesAttended();
  const createTask = useCreateTask();

  const current = subjects.find((s) => s.id === currentSubjectId);
  const [mode, setMode] = useState<'view' | 'select' | 'create'>(current ? 'view' : 'select');
  const [editingEval, setEditingEval] = useState(false);
  const [evalInput, setEvalInput] = useState(evalText(current));

  const [newName, setNewName] = useState('');
  const usedColors = new Set(subjects.map((s) => s.color));
  const availableColor = SUBJECT_COLORS.find((c) => !usedColors.has(c)) ?? SUBJECT_COLORS[0]!;
  const [newColor, setNewColor] = useState(availableColor);

  const [taskType, setTaskType] = useState<TaskType>('assignment');
  const [taskContent, setTaskContent] = useState('');
  // 旧 combi 互換: 既定で「来週の授業曜日の前日」
  const [taskDate, setTaskDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay();
    const daysFromMonday = dow === 0 ? -6 : 1 - dow;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + daysFromMonday);
    const target = new Date(thisMonday);
    target.setDate(thisMonday.getDate() + 7 + dayOfWeek - 1);
    return formatDateLocal(target);
  });

  const subjectTasks = current
    ? tasks
        .filter((t) => t.subjectId === current.id && !t.completed)
        .slice()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    : [];

  const handleAssign = async (subjectId: string) => {
    await upsertSlot.mutateAsync({ semesterId, dayOfWeek, periodId, subjectId });
    onClose();
  };
  const handleCreate = async () => {
    if (!newName.trim()) return;
    const created = await createSubject.mutateAsync({
      semesterId, name: newName.trim(), color: newColor,
    });
    await upsertSlot.mutateAsync({ semesterId, dayOfWeek, periodId, subjectId: created.id });
    onClose();
  };

  const setDateRelative = (kind: 'prevWeekDayBefore' | 'thisWeekDayBefore' | 'nextWeekDayBefore' | 'nextWeek') => {
    // 旧 combi の setDate と同じロジック
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay(); // 0=日 ... 6=土
    const daysFromMonday = dow === 0 ? -6 : 1 - dow;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + daysFromMonday);

    const target = new Date(thisMonday);
    if (kind === 'prevWeekDayBefore') target.setDate(thisMonday.getDate() - 7 + dayOfWeek - 1);
    else if (kind === 'thisWeekDayBefore') target.setDate(thisMonday.getDate() + dayOfWeek - 1);
    else if (kind === 'nextWeekDayBefore') target.setDate(thisMonday.getDate() + 7 + dayOfWeek - 1);
    else target.setDate(thisMonday.getDate() + 7 + dayOfWeek);
    setTaskDate(formatDateLocal(target));
  };

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    const detail = taskContent.trim();
    await createTask.mutateAsync({
      semesterId,
      subjectId: current.id,
      type: taskType,
      title: detail || current.name,
      detail: detail || undefined,
      dueDate: taskDate,
    });
    setTaskContent('');
    onClose(); // 旧 combi 互換: 送信後にモーダルを閉じる
  };

  const saveEval = async () => {
    if (!current) return;
    await updateSubject.mutateAsync({
      id: current.id,
      evaluation: evalInput.trim() ? { displayText: evalInput.trim() } : null,
    });
    setEditingEval(false);
  };

  return (
    <div className="modal" style={{ display: 'block' }} onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title-row">
            <h2>{current ? current.name : 'コマを設定'}</h2>
            {current && (
              <div className="modal-evaluation-wrap">
                {editingEval ? (
                  <input
                    type="text"
                    className="modal-evaluation-input"
                    value={evalInput}
                    onChange={(e) => setEvalInput(e.target.value)}
                    placeholder="評価を自由に入力"
                  />
                ) : (
                  <span className={`modal-evaluation${evalInput ? '' : ' empty'}`}>
                    {evalInput || '評価未設定'}
                  </span>
                )}
                <button
                  type="button"
                  className={`modal-evaluation-edit-btn${editingEval ? ' edit-mode' : ''}`}
                  onClick={() => (editingEval ? saveEval() : setEditingEval(true))}
                  title={editingEval ? '保存' : '評価を編集'}
                >
                  {editingEval ? '✓' : '✎'}
                </button>
              </div>
            )}
          </div>
          <p>{current ? '進捗管理 ＆ タスク作成' : '科目を選択または作成'}</p>
        </div>

        {current ? (
          <>
            <div className="progress-section">
              <div className="action-buttons">
                <button
                  className="btn primary large"
                  onClick={(e) => {
                    triggerRipple(e.currentTarget, e.clientX, e.clientY);
                    playCelebrate(e.clientX, e.clientY, PALETTE_GREEN);
                    adjustLectures.mutate({ id: current.id, delta: 1 });
                    onClose(); // 旧 combi 互換: 押下でモーダルを閉じる
                  }}
                >
                  Understood!
                </button>
                <button
                  className="btn secondary large"
                  onClick={(e) => {
                    triggerRipple(e.currentTarget, e.clientX, e.clientY);
                    adjustLectures.mutate({ id: current.id, delta: -1 });
                    onClose();
                  }}
                  disabled={current.lecturesAttended <= 0}
                >
                  Undo
                </button>
              </div>
              <div style={{ textAlign: 'center', color: '#596275', fontSize: 13 }}>
                進捗: {current.lecturesAttended}
              </div>
            </div>

            {subjectTasks.length > 0 && (
              <>
                <div className="section-divider"></div>
                <div className="task-section">
                  <div className="section-title">未完了タスク ({subjectTasks.length})</div>
                  {subjectTasks.map((t) => {
                    const detailText =
                      t.detail ?? (t.title !== current.name ? t.title : '');
                    return (
                      <div
                        key={t.id}
                        style={{
                          padding: '8px 10px', background: '#F5F5F5',
                          borderRadius: 6, marginBottom: 6, fontSize: 13,
                        }}
                      >
                        <strong>{detailText || '（詳細なし）'}</strong>
                        <span style={{ float: 'right', color: '#596275' }}>
                          {formatDueDate(t.dueDate)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="section-divider"></div>

            <div className="task-section">
              <form onSubmit={handleSubmitTask}>
                <div className="form-group">
                  <label>Task Type</label>
                  <div className="task-type-buttons">
                    {TASK_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        className={`task-type-btn${taskType === t.value ? ' active' : ''}`}
                        onClick={() => setTaskType(t.value)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="taskContent">Details</label>
                  <input
                    type="text"
                    id="taskContent"
                    value={taskContent}
                    onChange={(e) => setTaskContent(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <div className="date-buttons">
                    <button type="button" onClick={() => setDateRelative('prevWeekDayBefore')}>先週の前日</button>
                    <button type="button" onClick={() => setDateRelative('thisWeekDayBefore')}>今週の前日</button>
                    <button type="button" onClick={() => setDateRelative('nextWeekDayBefore')}>来週の前日</button>
                    <button type="button" onClick={() => setDateRelative('nextWeek')}>来週</button>
                  </div>
                  <input
                    type="date"
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="submit-button">
                  Add Task
                </button>
              </form>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            <div className="task-type-buttons" style={{ marginBottom: 16 }}>
              <button
                type="button"
                className={`task-type-btn${mode === 'select' ? ' active' : ''}`}
                onClick={() => setMode('select')}
              >
                既存科目
              </button>
              <button
                type="button"
                className={`task-type-btn${mode === 'create' ? ' active' : ''}`}
                onClick={() => setMode('create')}
              >
                新規作成
              </button>
            </div>

            {mode === 'select' && (
              <div className="form-group">
                {subjects.length === 0 ? (
                  <div style={{ color: '#596275' }}>科目が未登録です</div>
                ) : (
                  subjects.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleAssign(s.id)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        margin: '4px 0', padding: '10px',
                        background: s.color || '#F5F5F5',
                        border: '1px solid #E0E0E0', borderRadius: 6, cursor: 'pointer',
                      }}
                    >
                      {s.name}
                    </button>
                  ))
                )}
              </div>
            )}

            {mode === 'create' && (
              <>
                <div className="form-group">
                  <label>科目名</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                </div>
                <div className="form-group">
                  <label>色</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {SUBJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewColor(c)}
                        style={{
                          width: 32, height: 32, padding: 0, background: c,
                          border: newColor === c ? '3px solid #1A237E' : '1px solid #E0E0E0',
                          borderRadius: 6, cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </div>
                <button className="submit-button" onClick={handleCreate} disabled={!newName.trim()}>
                  作成して割当
                </button>
              </>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
