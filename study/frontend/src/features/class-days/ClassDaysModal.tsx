import { useMemo, useState } from 'react';
import type { Semester } from '../../lib/types.js';
import {
  useClassDays,
  useToggleClassDay,
  useWeekdayBulk,
  useResetClassDays,
} from './hooks.js';
import { useUpdateSemester } from '../semesters/hooks.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function pad(n: number): string { return n.toString().padStart(2, '0'); }
function ymd(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthLabel(d: Date): string { return `${d.getFullYear()}年${d.getMonth() + 1}月`; }

type Props = {
  semester: Semester;
  onClose: () => void;
};

export function ClassDaysModal({ semester, onClose }: Props) {
  const { data: classDays = [] } = useClassDays(semester.id);
  const toggle = useToggleClassDay();
  const bulk = useWeekdayBulk();
  const reset = useResetClassDays();
  const updateSem = useUpdateSemester();

  const [editDates, setEditDates] = useState(false);
  const [startDateInput, setStartDateInput] = useState(semester.startDate);
  const [endDateInput, setEndDateInput] = useState(semester.endDate);

  const classDaySet = useMemo(() => new Set(classDays.map((c) => c.date)), [classDays]);
  const semStart = new Date(semester.startDate);
  const semEnd = new Date(semester.endDate);

  // 学期内の月リスト
  const months = useMemo(() => {
    const list: Date[] = [];
    const cur = new Date(semStart.getFullYear(), semStart.getMonth(), 1);
    const end = new Date(semEnd.getFullYear(), semEnd.getMonth(), 1);
    while (cur <= end) {
      list.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return list;
  }, [semester.startDate, semester.endDate]);

  // 学期全体の曜日別 授業日カウント
  const weekdayCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const cd of classDays) counts[new Date(cd.date).getDay()]!++;
    return counts;
  }, [classDays]);

  const handleClick = (iso: string, inSemester: boolean, isWeekend: boolean) => {
    if (!inSemester || isWeekend) return;
    toggle.mutate({ semesterId: semester.id, date: iso });
  };

  const saveDates = async () => {
    await updateSem.mutateAsync({
      id: semester.id,
      startDate: startDateInput,
      endDate: endDateInput,
    });
    setEditDates(false);
  };

  const bulkAllMonths = (jsWeekday: number, setHoliday: boolean) => {
    // 学期内の全月でその曜日を一括変更
    Promise.all(
      months.map((m) =>
        bulk.mutateAsync({
          semesterId: semester.id,
          year: m.getFullYear(),
          month: m.getMonth() + 1,
          jsWeekday,
          setHoliday,
        })
      )
    );
  };

  const totalClassDays = classDays.length;

  return (
    <div className="modal" style={{ display: 'block' }} onClick={onClose}>
      <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100 }}>
        {/* === Header === */}
        <div className="modal-header">
          <div className="modal-header-title-row">
            <h2>授業日カレンダー</h2>
            <button className="modal-close-btn" onClick={onClose}>×</button>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>
            {semester.name} ・ {semester.startDate} 〜 {semester.endDate}
          </p>
        </div>

        <div className="modal-body" style={{ padding: '0 20px 20px' }}>

          {/* === 上部ツールバー === */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              padding: '12px 14px', background: '#F8F9FA', borderRadius: 8,
              border: '1px solid #E0E0E0', marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: '#1A237E', lineHeight: 1 }}>
                {totalClassDays}
              </span>
              <span style={{ fontSize: 11, color: '#596275', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                総授業日
              </span>
            </div>
            <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                className="btn-small"
                onClick={() => setEditDates(!editDates)}
              >
                {editDates ? '期間編集を閉じる' : '期間を編集'}
              </button>
              <button
                className="btn-small btn-select"
                onClick={() => {
                  if (confirm('全ての平日(月-金)を授業日にリセットしますか？\n（祝日設定は失われます）')) {
                    reset.mutate(semester.id);
                  }
                }}
              >
                平日をリセット
              </button>
            </div>
          </div>

          {/* === 期間編集（折り畳み） === */}
          {editDates && (
            <div className="semester-date-edit" style={{ marginBottom: 16 }}>
              <div className="date-edit-group">
                <label>開始</label>
                <input type="date" className="date-input" value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)} />
              </div>
              <div className="date-edit-group">
                <label>終了</label>
                <input type="date" className="date-input" value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)} />
              </div>
              <div className="date-edit-actions">
                <button className="btn btn-small btn-primary" onClick={saveDates}>保存</button>
                <button className="btn btn-small" onClick={() => setEditDates(false)}>キャンセル</button>
              </div>
            </div>
          )}

          {/* === 曜日サマリ + 一括操作 === */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {[1, 2, 3, 4, 5].map((wd) => (
              <div
                key={wd}
                style={{
                  background: '#fff', border: '1px solid #E0E0E0', borderRadius: 8,
                  padding: '10px 8px', textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, color: '#596275', marginBottom: 4, fontWeight: 600 }}>
                  {WEEKDAYS[wd]}曜日
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1A237E', marginBottom: 6 }}>
                  {weekdayCounts[wd]}<span style={{ fontSize: 11, color: '#596275', marginLeft: 2 }}>回</span>
                </div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                  <button
                    className="btn-small"
                    title={`全${WEEKDAYS[wd]}曜日を休日に`}
                    style={{ flex: 1, padding: '4px 6px', fontSize: 11 }}
                    onClick={() => bulkAllMonths(wd, true)}
                  >
                    全休
                  </button>
                  <button
                    className="btn-small btn-select"
                    title={`全${WEEKDAYS[wd]}曜日を授業日に`}
                    style={{ flex: 1, padding: '4px 6px', fontSize: 11 }}
                    onClick={() => bulkAllMonths(wd, false)}
                  >
                    全授
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* === 凡例 === */}
          <div
            style={{
              display: 'flex', gap: 16, fontSize: 12, color: '#596275', flexWrap: 'wrap',
              marginBottom: 12, padding: '8px 12px', background: '#F8F9FA', borderRadius: 6,
            }}
          >
            <Legend color="#E3F2FD" border="#1A237E" label="授業日" />
            <Legend color="#FFEBEE" border="#EF4444" label="休日" />
            <Legend color="#FFF9E6" border="#E0E0E0" label="週末" />
            <Legend color="#F5F5F5" border="#E0E0E0" label="学期外" />
            <span style={{ marginLeft: 'auto', fontStyle: 'italic' }}>
              平日をクリックで休日／授業日を切替
            </span>
          </div>

          {/* === マルチ月カレンダー === */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            {months.map((m) => (
              <MonthCalendar
                key={ymd(m)}
                month={m}
                semStart={semStart}
                semEnd={semEnd}
                classDaySet={classDaySet}
                onCellClick={handleClick}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, border, label }: { color: string; border: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          display: 'inline-block', width: 14, height: 14,
          background: color, border: `1px solid ${border}`, borderRadius: 3,
        }}
      />
      {label}
    </span>
  );
}

function MonthCalendar({
  month, semStart, semEnd, classDaySet, onCellClick,
}: {
  month: Date;
  semStart: Date;
  semEnd: Date;
  classDaySet: Set<string>;
  onCellClick: (iso: string, inSemester: boolean, isWeekend: boolean) => void;
}) {
  const cells = useMemo(() => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstOfMonth = new Date(year, m, 1);
    const start = new Date(firstOfMonth);
    start.setDate(start.getDate() - start.getDay()); // 日曜まで戻す
    const lastOfMonth = new Date(year, m + 1, 0);
    const end = new Date(lastOfMonth);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const list: { date: Date; iso: string; inMonth: boolean; inSemester: boolean }[] = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      list.push({
        date: new Date(d),
        iso: ymd(d),
        inMonth: d.getMonth() === m,
        inSemester: d >= semStart && d <= semEnd,
      });
    }
    return list;
  }, [month, semStart, semEnd]);

  return (
    <div className="month-calendar" style={{ minWidth: 0, maxWidth: 'none' }}>
      <div className="month-title">{monthLabel(month)}</div>
      <div className="calendar-header">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-header-cell">
            <span className="weekday-label">{w}</span>
          </div>
        ))}
      </div>
      <div className="calendar-week" style={{ gridAutoRows: '1fr' }}>
        {cells.map((c) => {
          const dow = c.date.getDay();
          const isWeekend = dow === 0 || dow === 6;
          const isWeekdayInSemester = c.inSemester && !isWeekend;
          const isClassDay = isWeekdayInSemester && classDaySet.has(c.iso);
          const isHoliday = isWeekdayInSemester && !classDaySet.has(c.iso);

          const cls = [
            'calendar-day',
            !c.inMonth && 'other-month',
            !c.inSemester && 'out-of-semester',
            isWeekend && c.inSemester && 'weekend',
            isClassDay && 'class-day',
            isHoliday && 'holiday',
          ].filter(Boolean).join(' ');

          return (
            <div
              key={c.iso}
              className={cls}
              onClick={() => onCellClick(c.iso, c.inSemester && c.inMonth, isWeekend)}
            >
              {c.date.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
