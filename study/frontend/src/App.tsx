import { useEffect, useMemo } from 'react';
import { useAppStore } from './lib/store.js';
import { useSemesters } from './features/semesters/hooks.js';
import { useSubjects } from './features/subjects/hooks.js';
import { useTimetable } from './features/timetable/hooks.js';
import { useClassDays } from './features/class-days/hooks.js';
import { useTasks } from './features/tasks/hooks.js';
import { TimetableView } from './features/timetable/TimetableView.js';
import { TasksView } from './features/tasks/TasksView.js';
import { ManageView } from './features/manage/ManageView.js';
import { computeSubjectStats, maxElapsedWeekFromClassDays } from './lib/stats.js';

export function App() {
  const { activeTab, setActiveTab, currentSemesterId, setCurrentSemesterId } = useAppStore();
  const { data: semesters } = useSemesters();
  const semester = semesters?.find((s) => s.id === currentSemesterId);

  useEffect(() => {
    if (currentSemesterId || !semesters || semesters.length === 0) return;
    const fallback = semesters.find((s) => s.isCurrent) ?? semesters[semesters.length - 1];
    if (fallback) setCurrentSemesterId(fallback.id);
  }, [semesters, currentSemesterId, setCurrentSemesterId]);

  const { data: subjects = [] } = useSubjects(currentSemesterId);
  const { data: slots = [] } = useTimetable(currentSemesterId);
  const { data: classDays = [] } = useClassDays(currentSemesterId);
  const { data: tasks = [] } = useTasks({ semesterId: currentSemesterId });

  const stats = useMemo(() => {
    if (!semester) return null;
    const subjectStats = computeSubjectStats({ subjects, slots, classDays });
    const totalRequired = subjectStats.reduce((sum, s) => sum + s.currentWeek, 0);
    const totalAttended = subjectStats.reduce((sum, s) => sum + s.subject.lecturesAttended, 0);
    const overall = totalRequired > 0 ? Math.round((totalAttended / totalRequired) * 100) : 0;
    const week = maxElapsedWeekFromClassDays(classDays);
    const deficitCount = subjectStats.filter((s) => s.deficit > 0).length;
    const openTasks = tasks.filter((t) => !t.completed).length + deficitCount;
    return { overall, week, openTasks };
  }, [semester, subjects, slots, classDays, tasks]);

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">Tabler</h1>
          <div className="summary-stats">
            <div className="stat-card">
              <div className="stat-label">Overall Progress</div>
              <div className="stat-value">{stats?.overall ?? 0}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Current Week</div>
              <div className="stat-value">Week {stats?.week ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Open Tasks</div>
              <div className="stat-value">{stats?.openTasks ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="header-right">
          {semesters && semesters.length > 1 && (
            <select
              value={currentSemesterId ?? ''}
              onChange={(e) => setCurrentSemesterId(e.target.value || null)}
              style={{
                marginRight: 12, padding: '6px 10px',
                borderRadius: 8, border: '1px solid #E6E8F0',
              }}
            >
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <div className="tabs">
            <div
              className={`tab ${activeTab === 'timetable' ? 'active' : ''}`}
              onClick={() => setActiveTab('timetable')}
            >
              Timetable
            </div>
            <div
              className={`tab ${activeTab === 'tasks' ? 'active' : ''}`}
              onClick={() => setActiveTab('tasks')}
            >
              Tasks
            </div>
            <div
              className={`tab ${activeTab === 'manage' ? 'active' : ''}`}
              onClick={() => setActiveTab('manage')}
            >
              Manage
            </div>
          </div>
        </div>
      </header>

      <div className={`tab-content ${activeTab === 'timetable' ? 'active' : ''}`}>
        <TimetableView />
      </div>
      <div className={`tab-content ${activeTab === 'tasks' ? 'active' : ''}`}>
        <TasksView />
      </div>
      <div className={`tab-content ${activeTab === 'manage' ? 'active' : ''}`}>
        <ManageView />
      </div>
    </>
  );
}
