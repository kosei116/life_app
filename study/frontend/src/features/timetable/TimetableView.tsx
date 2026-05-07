import { useMemo, useState } from 'react';
import { useAppStore } from '../../lib/store.js';
import { usePeriods } from '../periods/hooks.js';
import { useSubjects } from '../subjects/hooks.js';
import { useTimetable } from './hooks.js';
import { useClassDays } from '../class-days/hooks.js';
import { useTasks } from '../tasks/hooks.js';
import { SubjectModal } from './SubjectModal.js';
import { TaskPopup } from '../tasks/TaskPopup.js';
import { computeSubjectStats, progressColorClass, classifyTaskDueDate } from '../../lib/stats.js';
import type { Task } from '../../lib/types.js';

const DAYS = ['月', '火', '水', '木', '金'];
const JS_TO_LABEL = ['日', '月', '火', '水', '木', '金', '土'];

export function TimetableView() {
  const semesterId = useAppStore((s) => s.currentSemesterId);
  const { data: periods = [] } = usePeriods(semesterId);
  const { data: subjects = [] } = useSubjects(semesterId);
  const { data: slots = [] } = useTimetable(semesterId);
  const { data: classDays = [] } = useClassDays(semesterId);
  const { data: tasks = [] } = useTasks({ semesterId });
  const [open, setOpen] = useState<{ dayOfWeek: number; periodId: string } | null>(null);
  const [taskPopupSubjectId, setTaskPopupSubjectId] = useState<string | null>(null);

  const slotMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of slots) m.set(`${s.dayOfWeek}-${s.periodId}`, s.subjectId);
    return m;
  }, [slots]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const stats = useMemo(() => {
    const arr = computeSubjectStats({ subjects, slots, classDays });
    return new Map(arr.map((s) => [s.subject.id, s]));
  }, [subjects, slots, classDays]);

  const tasksBySubject = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.completed || !t.subjectId) continue;
      if (!m.has(t.subjectId)) m.set(t.subjectId, []);
      m.get(t.subjectId)!.push(t);
    }
    return m;
  }, [tasks]);

  const now = new Date();
  const currentDayLabel = JS_TO_LABEL[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (!semesterId) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#596275' }}>学期を選択してください（Manage タブで作成）</div>;
  }
  if (periods.length === 0) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#596275' }}>準備中...</div>;
  }

  const displayPeriods = periods.slice(0, 5);

  const cells: React.ReactNode[] = [];
  cells.push(<div key="hdr-corner" className="cell header"></div>);
  DAYS.forEach((day) => {
    const cls = `cell header${day === currentDayLabel ? ' current-day-header' : ''}`;
    cells.push(<div key={`hdr-${day}`} className={cls}>{day}</div>);
  });

  displayPeriods.forEach((p) => {
    cells.push(
      <div key={`time-${p.id}`} className="cell time">
        <div className="period-name">{p.periodNumber}限</div>
        <div className="period-time">{p.startTime.slice(0, 5)}-{p.endTime.slice(0, 5)}</div>
      </div>
    );
    DAYS.forEach((day, dayIdx) => {
      const subjectId = slotMap.get(`${dayIdx}-${p.id}`);
      const subject = subjectId ? subjectMap.get(subjectId) : null;
      const stat = subject ? stats.get(subject.id) : null;
      const isCurrent = day === currentDayLabel && (() => {
        const [sh, sm] = p.startTime.split(':').map(Number);
        const [eh, em] = p.endTime.split(':').map(Number);
        const start = sh! * 60 + sm!;
        const end = eh! * 60 + em!;
        return currentMinutes >= start && currentMinutes <= end;
      })();

      if (!subject) {
        cells.push(
          <div
            key={`cell-${dayIdx}-${p.id}`}
            className={`cell${isCurrent ? ' current-period' : ''}`}
            data-period={`${p.periodNumber}限`}
            data-day={day}
            onClick={() => setOpen({ dayOfWeek: dayIdx, periodId: p.id })}
          />
        );
        return;
      }

      const subjectTasks = tasksBySubject.get(subject.id) ?? [];
      const earliestTask = subjectTasks
        .slice()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      const dueClass = earliestTask ? `due-date-${classifyTaskDueDate(earliestTask.dueDate)}` : '';

      cells.push(
        <div
          key={`cell-${dayIdx}-${p.id}`}
          className={`cell${isCurrent ? ' current-period' : ''}`}
          data-period={`${p.periodNumber}限`}
          data-day={day}
          data-subject-id={subject.id}
          style={{ backgroundColor: subject.color || '#F5F5F5' }}
          onClick={() => setOpen({ dayOfWeek: dayIdx, periodId: p.id })}
        >
          <div className="title">{subject.name}</div>
          <div className="progress">
            <div
              className={`progress-bar ${progressColorClass(stat?.percent ?? 0)}`}
              style={{ width: `${stat?.percent ?? 0}%` }}
            />
          </div>
          <div className="progress-text">
            {subject.lecturesAttended}/{stat?.currentWeek ?? 1}
          </div>
          {subjectTasks.length > 0 && (
            <div
              className={`number-circle shape-circle ${dueClass}`}
              onClick={(e) => {
                e.stopPropagation();
                setTaskPopupSubjectId(subject.id);
              }}
            >
              {subjectTasks.length}
            </div>
          )}
        </div>
      );
    });
  });

  return (
    <>
      <div className="timetable" id="timetable">{cells}</div>
      {open && (
        <SubjectModal
          semesterId={semesterId}
          dayOfWeek={open.dayOfWeek}
          periodId={open.periodId}
          subjects={subjects}
          tasks={tasks}
          currentSubjectId={slotMap.get(`${open.dayOfWeek}-${open.periodId}`) ?? null}
          onClose={() => setOpen(null)}
        />
      )}
      {taskPopupSubjectId && (() => {
        const sub = subjectMap.get(taskPopupSubjectId);
        if (!sub) return null;
        return (
          <TaskPopup
            subject={sub}
            subjects={subjects}
            tasks={tasks}
            onClose={() => setTaskPopupSubjectId(null)}
          />
        );
      })()}
    </>
  );
}
