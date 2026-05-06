import { useMemo } from 'react';
import { useAppStore } from '../../lib/store.js';
import { useSubjects } from '../subjects/hooks.js';
import { useTasks, useUpdateTask, useDeleteTask } from './hooks.js';
import { useTimetable } from '../timetable/hooks.js';
import { useClassDays } from '../class-days/hooks.js';
import { computeSubjectStats, formatDueDate, classifyTaskDueDate } from '../../lib/stats.js';
import { useAdjustLecturesAttended } from '../subjects/hooks.js';
import { playCelebrate, triggerRipple, PALETTE_GREEN, PALETTE_BLUE } from '../../lib/animations.js';

export function TasksView() {
  const semesterId = useAppStore((s) => s.currentSemesterId);
  const { data: subjects = [] } = useSubjects(semesterId);
  const { data: tasks = [] } = useTasks({ semesterId });
  const { data: slots = [] } = useTimetable(semesterId);
  const { data: classDays = [] } = useClassDays(semesterId);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const adjustLectures = useAdjustLecturesAttended();

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const active = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  const deficitSubjects = useMemo(() => {
    if (subjects.length === 0) return [];
    const stats = computeSubjectStats({ subjects, slots, classDays });
    return stats.filter((s) => s.deficit > 0).sort((a, b) => b.deficit - a.deficit);
  }, [subjects, slots, classDays]);

  if (!semesterId) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#596275' }}>学期を選択してください</div>;
  }

  return (
    <div className="task-list">
      <div className="tasks-grid">
        <div className="tasks-column">
          <div className="progress-deficit-section-header">
            進捗の遅れ ({deficitSubjects.length})
          </div>
          {deficitSubjects.length === 0 && (
            <div style={{ color: '#596275', textAlign: 'center', padding: 20 }}>遅れなし</div>
          )}
          {deficitSubjects.map(({ subject, deficit, currentWeek, percent }) => (
            <div
              key={subject.id}
              className="task-item progress-deficit-task"
              style={{ background: subject.color }}
            >
              <div className="task-content">
                <div className="task-title">{subject.name}</div>
                <div className="progress" style={{ width: '100%', maxWidth: 300 }}>
                  <div
                    className="progress-bar pct-2"
                    style={{ width: `${percent}%`, background: '#E53E3E' }}
                  />
                </div>
                <div className="task-details">
                  {subject.lecturesAttended}/{currentWeek}（−{deficit} 遅れ）
                </div>
              </div>
              <div className="progress-buttons">
                <button
                  className="progress-understand-btn"
                  onClick={(e) => {
                    triggerRipple(e.currentTarget, e.clientX, e.clientY);
                    playCelebrate(e.clientX, e.clientY, PALETTE_GREEN);
                    adjustLectures.mutate({ id: subject.id, delta: 1 });
                  }}
                >
                  Understood!
                </button>
                <button
                  className="progress-ununderstand-btn"
                  onClick={(e) => {
                    triggerRipple(e.currentTarget, e.clientX, e.clientY);
                    adjustLectures.mutate({ id: subject.id, delta: -1 });
                  }}
                  disabled={subject.lecturesAttended <= 0}
                >
                  Undo
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="tasks-column">
          <div className="tasks-section-header">未完了タスク ({active.length})</div>
          {active.length === 0 && (
            <div style={{ color: '#596275', textAlign: 'center', padding: 20 }}>タスクなし</div>
          )}
          {active.map((t) => {
            const sub = t.subjectId ? subjectMap.get(t.subjectId) : null;
            const headTitle = sub?.name ?? (t.title && t.title !== '(無題)' ? t.title : 'Unknown');
            const isPlaceholder = !t.title || t.title === '(無題)';
            const detailText = isPlaceholder
              ? (t.detail ?? '')
              : sub
                ? t.title // subject 名と別の意味のタイトルがある場合は本文として表示
                : (t.detail ?? '');
            return (
              <div
                key={t.id}
                className="task-item"
                style={sub ? { background: sub.color } : undefined}
              >
                <input
                  type="checkbox"
                  className="task-checkbox"
                  checked={t.completed}
                  onChange={(e) => {
                    const willComplete = !t.completed;
                    if (willComplete) {
                      const item = e.currentTarget.closest('.task-item') as HTMLElement | null;
                      if (item) {
                        item.classList.add('completed-animate');
                        setTimeout(() => item.classList.remove('completed-animate'), 500);
                        const r = item.getBoundingClientRect();
                        playCelebrate(r.left + r.width / 2, r.top + r.height / 2, PALETTE_BLUE);
                      }
                    }
                    updateTask.mutate({ id: t.id, completed: willComplete });
                  }}
                />
                <div className="task-content">
                  <div className="task-title">{headTitle}</div>
                  <div className="task-details">
                    <span>{detailText}</span>
                    <span
                      className={`due-date due-date-${classifyTaskDueDate(t.dueDate)}`}
                      style={{ marginLeft: 'auto', fontWeight: 600 }}
                    >
                      {formatDueDate(t.dueDate)}（{t.dueDate}）
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {completed.length > 0 && (
        <>
          <div className="task-section-divider" />
          <h3 style={{ fontSize: 15, color: '#596275', margin: '20px 0 10px' }}>
            完了タスク ({completed.length})
          </h3>
          {completed.map((t) => {
            const sub = t.subjectId ? subjectMap.get(t.subjectId) : null;
            const headTitle = sub?.name ?? (t.title && t.title !== '(無題)' ? t.title : 'Unknown');
            const isPlaceholder = !t.title || t.title === '(無題)';
            const detailText = isPlaceholder
              ? (t.detail ?? '')
              : sub ? t.title : (t.detail ?? '');
            return (
            <div key={t.id} className="task-item" style={{ opacity: 0.5 }}>
              <input
                type="checkbox"
                className="task-checkbox"
                checked={t.completed}
                onChange={() => updateTask.mutate({ id: t.id, completed: !t.completed })}
              />
              <div className="task-content">
                <div className="task-title" style={{ textDecoration: 'line-through' }}>{headTitle}</div>
                <div className="task-details">{detailText}</div>
              </div>
              <button
                className="task-edit-btn"
                style={{ borderColor: '#E53E3E', color: '#E53E3E' }}
                onClick={() => deleteTask.mutate(t.id)}
              >
                削除
              </button>
            </div>
            );
          })}
        </>
      )}
    </div>
  );
}
