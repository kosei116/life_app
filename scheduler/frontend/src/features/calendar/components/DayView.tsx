import { useMemo } from 'react';
import type { Event } from '@life-app/types';
import { formatJst, jstStartOfDayUtc } from '../../../lib/date-utils';
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

export function DayView({
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
  const dayKey = formatJst(anchor, 'yyyy-MM-dd');
  const { timedEvents, allDayEvents } = useMemo(() => {
    const timed: Event[] = [];
    const allDay: Event[] = [];
    for (const ev of events) {
      if (formatJst(ev.start_at, 'yyyy-MM-dd') !== dayKey) continue;
      (ev.all_day ? allDay : timed).push(ev);
    }
    return { timedEvents: timed, allDayEvents: allDay };
  }, [events, dayKey]);

  const isToday = dayKey === formatJst(new Date(), 'yyyy-MM-dd');
  const header = (
    <div
      style={{
        padding: '10px 6px',
        textAlign: 'center',
        fontSize: 'var(--fs-md)',
        fontWeight: 600,
        borderLeft: '1px solid var(--c-border)',
        color: isToday ? 'var(--c-accent)' : 'var(--c-text)',
        letterSpacing: '-0.01em',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {formatJst(anchor, 'M/d (E)')}
    </div>
  );

  const allDayRow = (
    <AllDayCell
      events={allDayEvents}
      onTapEvent={onTapEvent}
      onLongPressEmpty={() => onAddAllDay(anchor)}
    />
  );

  return (
    <TimeGridShell header={header} columnCount={1} allDayRow={allDayRow}>
      <TimeGridColumn
        day={anchor}
        dayStartUtc={jstStartOfDayUtc(anchor)}
        events={timedEvents}
        moveTarget={moveTarget}
        onAdd={onAdd}
        onTapEvent={onTapEvent}
        onLongPressEvent={onLongPressEvent}
        onDragMoveEvent={onDragMoveEvent}
        onDropTo={onDropTo}
        onDropEventAt={onDropEventAt}
      />
    </TimeGridShell>
  );
}

export function getDayRange(anchor: Date): { from: Date; to: Date } {
  const from = jstStartOfDayUtc(anchor);
  const to = new Date(from.getTime() + 86400000);
  return { from, to };
}
