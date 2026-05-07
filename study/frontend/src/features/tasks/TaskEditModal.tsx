import { useState } from 'react';
import type { Subject, Task, TaskType } from '../../lib/types.js';
import { useUpdateTask, useDeleteTask } from './hooks.js';

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'report', label: 'Report' },
  { value: 'test', label: 'Test' },
  { value: 'other', label: 'Other' },
];

type Props = {
  task: Task;
  subjects: Subject[];
  onClose: () => void;
};

export function TaskEditModal({ task, subjects, onClose }: Props) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const sub = subjects.find((s) => s.id === task.subjectId);
  const initialDetail =
    task.detail ?? (task.title && task.title !== sub?.name ? task.title : '');

  const [type, setType] = useState<TaskType>(task.type);
  const [detail, setDetail] = useState(initialDetail);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [subjectId, setSubjectId] = useState<string | null>(task.subjectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = detail.trim();
    const matchedSubject = subjects.find((s) => s.id === subjectId);
    await updateTask.mutateAsync({
      id: task.id,
      type,
      detail: trimmed || null,
      title: trimmed || matchedSubject?.name || task.title,
      dueDate,
      subjectId,
    });
    onClose();
  };

  const handleDelete = async () => {
    if (!confirm('このタスクを削除しますか？')) return;
    await deleteTask.mutateAsync(task.id);
    onClose();
  };

  return (
    <div className="modal" style={{ display: 'block' }} onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        <div className="modal-header">
          <div className="modal-header-title-row">
            <h2>タスクを編集</h2>
            <button className="modal-close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="task-section">
          <div className="form-group">
            <label>Task Type</label>
            <div className="task-type-buttons">
              {TASK_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`task-type-btn${type === t.value ? ' active' : ''}`}
                  onClick={() => setType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>科目</label>
            <select
              value={subjectId ?? ''}
              onChange={(e) => setSubjectId(e.target.value || null)}
              style={{ width: '100%', padding: 8 }}
            >
              <option value="">（なし）</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="taskEditDetail">Details</label>
            <input
              type="text"
              id="taskEditDetail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="タスクの内容"
            />
          </div>

          <div className="form-group">
            <label>Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>

          <div className="modal-actions" style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="submit-button">保存</button>
            <button
              type="button"
              className="btn"
              style={{ borderColor: '#E53E3E', color: '#E53E3E' }}
              onClick={handleDelete}
            >
              削除
            </button>
            <button type="button" className="btn" onClick={onClose}>キャンセル</button>
          </div>
        </form>
      </div>
    </div>
  );
}
