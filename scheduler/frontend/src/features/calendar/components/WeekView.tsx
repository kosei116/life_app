import { useMemo } from 'react';
import type { Event } from '@life-app/types';
import { formatJst, getWeekDays, jstStartOfDayUtc } from '../../../lib/date-utils';
import { TimeGridColumn } from './TimeGridColumn';
import { TimeGridShell } from './TimeGridShell';
import { AllDayCell } from './AllDayCell';

interface Props {
  anchor: Date;
  events: Event[];
  moveTarget: Event | null;
  onAdd: (start: Date, end: Date) => void;
  onTapEvent: (e: Event) => void;
  onLongPressEvent: (e: Event, x: number, y: number) => void;
  onDragMoveEvent: (e: Event, x: number, y: number) => void;
  onDropTo: (day: Date) => void;
  onDropEventAt: (e: Event, x: number, y: number) => void;
  onAddAllDay: (day: Date) => void;
}

export function WeekView({
  anchor,
  events,
  moveTarget,
  onAdd,
  onTapEvent,
  onLongPressEvent,
  onDragMoveEvent,
  onDropTo,
  onDropEventAt,
  onAddAllDay,
}: Props) {
  const days = useMemo(() => getWeekDays(anchor), [anchor]);

  const { timedByDay, allDayByDay } = useMemo(() => {
    const timedByDay = new Map<string, Event[]>();
    const allDayByDay = new Map<string, Event[]>();
    for (const ev of events) {
      const key = formatJst(ev.start_at, 'yyyy-MM-dd');
      const m = ev.all_day ? allDayByDay : timedByDay;
      const arr = m.get(key) ?? [];
      arr.push(ev);
      m.set(key, arr);
    }
    return { timedByDay, allDayByDay };
  }, [events]);


  const header = days.map((day) => {
    const isToday = formatJst(day, 'yyyy-MM-dd') === formatJst(new Date(), 'yyyy-MM-dd');
    return (
      <div
        key={day.toISOString()}
        style={{
          padding: '10px 6px',
          textAlign: 'center',
          fontSize: 'var(--fs-sm)',
          fontWeight: 600,
          borderLeft: '1px solid var(--c-border)',
          color: isToday ? 'var(--c-accent)' : 'var(--c-text)',
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatJst(day, 'M/d (E)')}
      </div>
    );
  });

  const allDayRow = days.map((day) => {
    const key = formatJst(day, 'yyyy-MM-dd');
    return (
      <AllDayCell
        key={day.toISOString()}
        events={allDayByDay.get(key) ?? []}
        onTapEvent={onTapEvent}
        onLongPressEmpty={() => onAddAllDay(day)}
      />
    );
  });

  return (
    <TimeGridShell header={header} columnCount={days.length} allDayRow={allDayRow}>
      {days.map((day) => {
        const key = formatJst(day, 'yyyy-MM-dd');
        return (
          <TimeGridColumn
            key={day.toISOString()}
            day={day}
            dayStartUtc={jstStartOfDayUtc(day)}
            events={timedByDay.get(key) ?? []}
            moveTarget={moveTarget}
            onAdd={onAdd}
            onTapEvent={onTapEvent}
            onLongPressEvent={onLongPressEvent}
            onDragMoveEvent={onDragMoveEvent}
            onDropTo={onDropTo}
            onDropEventAt={onDropEventAt}
          />
        );
      })}
    </TimeGridShell>
  );
}

export function getWeekRange(anchor: Date): { from: Date; to: Date } {
  const days = getWeekDays(anchor);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  return { from: jstStartOfDayUtc(first), to: jstStartOfDayUtc(new Date(last.getTime() + 86400000)) };
}
