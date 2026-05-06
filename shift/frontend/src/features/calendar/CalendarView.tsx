import { useMemo, useState } from 'react';
import { useAppStore } from '../../lib/store.js';
import { useShifts } from '../shifts/hooks.js';
import { useWorkplaces } from '../workplaces/hooks.js';
import { ShiftModal } from '../shifts/ShiftModal.js';
import { ymd, yenFormat, pad } from '../../lib/utils.js';
import type { Shift } from '../../lib/types.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function CalendarView() {
  const { currentMonth, setCurrentMonth } = useAppStore();
  const { data: workplaces = [] } = useWorkplaces();
  const monthStart = new Date(currentMonth.year, currentMonth.month - 1, 1);
  const { data: shifts = [] } = useShifts({
    from: new Date(currentMonth.year, currentMonth.month - 1, 1).toISOString(),
    to: new Date(currentMonth.year, currentMonth.month, 0, 23, 59, 59).toISOString(),
  });

  const wpMap = useMemo(() => new Map(workplaces.map((w) => [w.id, w])), [workplaces]);
  const [openShiftFor, setOpenShiftFor] = useState<{ date?: string; shift?: Shift } | null>(null);

  // 旧 part-time-legacy: 月初の曜日から前週日曜まで戻す
  const cells = useMemo(() => {
    const start = new Date(monthStart);
    start.setDate(start.getDate() - start.getDay());
    const list: { date: Date; iso: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      list.push({ date: d, iso: ymd(d), inMonth: d.getMonth() === monthStart.getMonth() });
    }
    return list;
  }, [monthStart]);

  const shiftsByDate = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) {
      const key = ymd(new Date(s.startAt));
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return m;
  }, [shifts]);

  const navMonth = (delta: number) => {
    const d = new Date(currentMonth.year, currentMonth.month - 1 + delta, 1);
    setCurrentMonth(d.getFullYear(), d.getMonth() + 1);
  };

  const monthLabel = `${currentMonth.year}年 ${currentMonth.month}月`;
  const todayISO = ymd(new Date());

  return (
    <div className="view-container active" id="monthView">
      <div className="month-navigation">
        <button className="month-nav-btn" onClick={() => navMonth(-1)} aria-label="前の月">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="month-current-date">{monthLabel}</div>
        <button className="month-nav-btn" onClick={() => navMonth(1)} aria-label="次の月">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="month-calendar">
        <div className="month-weekdays">
          {WEEKDAYS.map((w) => (
            <div key={w} className="weekday">{w}</div>
          ))}
        </div>
        <div className="month-grid">
          {cells.map((c) => {
            const dayShifts = shiftsByDate.get(c.iso) ?? [];
            const dailyIncome = dayShifts.reduce((sum, s) => sum + (s.calc?.totalPay ?? 0), 0);
            const isToday = c.iso === todayISO;
            const cls = [
              'month-day',
              !c.inMonth && 'other-month',
              isToday && 'today',
              dayShifts.length > 0 && 'has-events',
            ].filter(Boolean).join(' ');

            return (
              <div
                key={c.iso}
                className={cls}
                data-date={c.iso}
                onClick={() => {
                  if (c.inMonth && workplaces.length > 0) setOpenShiftFor({ date: c.iso });
                }}
              >
                <div className="month-day-number">{c.date.getDate()}</div>
                {dailyIncome > 0 && (
                  <div className="month-day-income">{yenFormat(dailyIncome)}</div>
                )}
                {dayShifts.length > 0 && (
                  <div className="month-day-events">
                    {dayShifts.slice(0, 5).map((s) => {
                      const wp = wpMap.get(s.workplaceId);
                      const sd = new Date(s.startAt);
                      const ed = new Date(s.endAt);
                      return (
                        <div
                          key={s.id}
                          className="month-event-dot-item"
                          title={`${wp?.name ?? 'シフト'} (${pad(sd.getHours())}:${pad(sd.getMinutes())}-${pad(ed.getHours())}:${pad(ed.getMinutes())})`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenShiftFor({ shift: s });
                          }}
                        >
                          <span
                            className="month-event-dot"
                            style={{ backgroundColor: wp?.color ?? '#3b82f6' }}
                          />
                          <div
                            className="month-event-times"
                            style={{ flexDirection: 'row', gap: 2, whiteSpace: 'nowrap' }}
                          >
                            <span className="month-event-time-range">
                              {pad(sd.getHours())}:{pad(sd.getMinutes())}~{pad(ed.getHours())}:{pad(ed.getMinutes())}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {dayShifts.length > 5 && (
                      <div className="month-event-dot-item">
                        <span className="month-event-more">+{dayShifts.length - 5}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {openShiftFor && (
        <ShiftModal
          initial={openShiftFor}
          workplaces={workplaces}
          onClose={() => setOpenShiftFor(null)}
        />
      )}
    </div>
  );
}
