import type { Subject, Task } from '../../lib/types.js';
import { useUpdateTask, useDeleteTask } from './hooks.js';
import { formatDueDate, classifyTaskDueDate, taskTypeLabel } from '../../lib/stats.js';
import { playCelebrate, PALETTE_BLUE } from '../../lib/animations.js';

type Props = {
  subject: Subject;
  tasks: Task[];
  onClose: () => void;
};

export function TaskPopup({ subject, tasks, onClose }: Props) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const subjectTasks = tasks
    .filter((t) => t.subjectId === subject.id && !t.completed)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="modal" style={{ display: 'block' }} onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, minHeight: 'auto' }}
      >
        <div className="modal-header">
          <div className="modal-header-title-row">
            <h2>{subject.name}</h2>
            <button className="modal-close-btn" onClick={onClose}>×</button>
          </div>
          <p>未完了タスク {subjectTasks.length} 件</p>
        </div>

        <div className="task-popup-list">
          {subjectTasks.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#596275', padding: 20 }}>タスクがありません</p>
          ) : (
            subjectTasks.map((t) => {
              const isPlaceholder = !t.title || t.title === subject.name;
              const detailText = isPlaceholder ? (t.detail ?? '') : t.title;
              const headTitle = taskTypeLabel(t.type);
              return (
                <div
                  key={t.id}
                  className="task-item"
                  style={{ background: subject.color }}
                >
                  <input
                    type="checkbox"
                    className="task-checkbox"
                    checked={t.completed}
                    onChange={(e) => {
                      const item = e.currentTarget.closest('.task-item') as HTMLElement | null;
                      if (item) {
                        item.classList.add('completed-animate');
                        setTimeout(() => item.classList.remove('completed-animate'), 500);
                        const r = item.getBoundingClientRect();
                        playCelebrate(r.left + r.width / 2, r.top + r.height / 2, PALETTE_BLUE);
                      }
                      updateTask.mutate({ id: t.id, completed: true });
                    }}
                  />
                  <div className="task-content">
                    <div className="task-title">{headTitle}</div>
                    <div className="task-details">
                      {detailText && <span style={{ marginRight: 8 }}>{detailText}</span>}
                      <span
                        className={`due-date due-date-${classifyTaskDueDate(t.dueDate)}`}
                        style={{ fontWeight: 600 }}
                      >
                        {formatDueDate(t.dueDate)}（{t.dueDate}）
                      </span>
                    </div>
                  </div>
                  <button
                    className="task-edit-btn"
                    style={{ borderColor: '#E53E3E', color: '#E53E3E' }}
                    onClick={() => {
                      if (confirm('このタスクを削除しますか？')) deleteTask.mutate(t.id);
                    }}
                  >
                    削除
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
